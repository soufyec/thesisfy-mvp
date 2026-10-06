import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { CitationCandidate, extractDoi, extractIsbn, lookupDoi, lookupIsbn, lookupUrl, searchCrossref } from "@/lib/citations";
import { costOf, resolveProvider, streamCompletion } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_SYSTEM = `You extract bibliographic metadata. Return ONLY a JSON object with keys: type ("article"|"book"|"chapter"|"web"|"thesis"), authors (string, "Last, F., Last, F."), year (string), title, source (journal, publisher or website), volume, issue, pages, doi, url. Use only information present in the input. Never invent authors, years, DOIs or titles: use "" for anything missing.`;

/**
 * Finds citation metadata for a source the student gives (DOI, ISBN, URL or free text), or for the selected passage.
 * Verified registries (Crossref, Open Library, page metadata) come first; the AI only structures what is in the input.
 */
export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = await request.json().catch(() => null);
  const query = String(body?.query || "").trim().slice(0, 2000);
  const selection = String(body?.selection || "").trim().slice(0, 1500);
  if (!query && !selection) return error("Enter a source (DOI, ISBN, URL or description) or select some text");
  const thesis = body?.thesisId ? canAccessThesis(user, body.thesisId) : null;
  const policy = db.policies.get(user.university);
  if (!policy.allowedModes.includes("citations")) return error("Your institution has not enabled the citation assistant", 403);

  let candidates: CitationCandidate[] = [];
  let method = "";
  let pageText: string | undefined;
  let finalUrl: string | undefined;

  const doi = query ? extractDoi(query) : null;
  const isbn = !doi && query ? extractIsbn(query) : null;
  const isUrl = /^https?:\/\//i.test(query);

  if (doi && !isUrl) {
    method = "doi";
    const c = await lookupDoi(doi);
    if (c) candidates = [c];
  } else if (isbn) {
    method = "isbn";
    const c = await lookupIsbn(isbn);
    if (c) candidates = [c];
  } else if (isUrl) {
    method = "url";
    const res = await lookupUrl(query);
    pageText = res.pageText;
    finalUrl = res.finalUrl;
    if (res.candidate) candidates = [res.candidate];
  } else {
    method = query ? "search" : "selection";
    candidates = await searchCrossref(query || selection, 5);
  }

  // AI fallback: structure a pasted reference or an incomplete web page. Never used to invent a source.
  const needsAi = (query && !isUrl && !doi && !isbn && /\(\d{4}\)|\d{4}\./.test(query) && query.length > 40) || (isUrl && (!candidates.length || !candidates[0].authors || !candidates[0].year));
  let aiUsed = false;
  let citeUsage = { inputTokens: 0, outputTokens: 0 };
  const cfg = resolveProvider(user, policy, null);
  if (needsAi && cfg.provider !== "demo") {
    const input = isUrl ? `URL: ${finalUrl || query}\nPage text excerpt:\n${pageText || ""}` : `Reference text:\n${query}`;
    let text = "";
    for await (const chunk of streamCompletion(cfg, AI_SYSTEM, [{ role: "user", content: input }], 800)) {
      if (chunk.type === "delta") text += chunk.text;
      else if (chunk.type === "usage") citeUsage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
    }
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
    if (jsonText) {
      try {
        const p = JSON.parse(jsonText);
        const ai: CitationCandidate = {
          type: ["article", "book", "chapter", "web", "thesis"].includes(p.type) ? p.type : isUrl ? "web" : "article",
          authors: String(p.authors || ""),
          year: String(p.year || ""),
          title: String(p.title || ""),
          source: String(p.source || ""),
          volume: p.volume ? String(p.volume) : undefined,
          issue: p.issue ? String(p.issue) : undefined,
          pages: p.pages ? String(p.pages) : undefined,
          doi: p.doi ? String(p.doi) : undefined,
          url: p.url ? String(p.url) : finalUrl,
          origin: "ai",
          verified: false,
          note: "AI-structured from your source: check every field.",
        };
        if (ai.title) {
          aiUsed = true;
          if (ai.doi) {
            const verified = await lookupDoi(ai.doi);
            if (verified) candidates.unshift(verified);
          }
          // merge into an incomplete page candidate instead of duplicating it
          if (isUrl && candidates[0]?.origin === "page") candidates[0] = { ...ai, ...Object.fromEntries(Object.entries(candidates[0]).filter(([, v]) => v)), origin: "ai", verified: false, note: ai.note };
          else candidates.push(ai);
        }
      } catch {
        /* ignore malformed model output */
      }
    }
  }

  db.interactions.create({
    userId: user.id,
    thesisId: thesis?.id,
    sessionId: body?.sessionId,
    provider: aiUsed ? (cfg.provider as never) : "demo",
    model: aiUsed ? cfg.model : `lookup:${method}`,
    mode: "citations",
    source: "thesisfic",
    promptPreview: (query || selection).slice(0, 200),
    responsePreview: candidates[0] ? `${candidates[0].authors} (${candidates[0].year}). ${candidates[0].title}`.slice(0, 200) : "no results",
    inputTokens: aiUsed ? citeUsage.inputTokens : 0,
    outputTokens: aiUsed ? citeUsage.outputTokens : 0,
    insertedWords: 0,
    blockedByPolicy: false,
    billedTo: aiUsed ? cfg.billedTo : "none",
    costUsd: aiUsed ? costOf(cfg, citeUsage) : 0,
    institutionModelId: aiUsed ? cfg.institutionModel?.id : undefined,
  });

  return json({ candidates: candidates.slice(0, 6), method, aiUsed, aiAvailable: cfg.provider !== "demo" });
}
