import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { costOf, resolveProvider } from "@/lib/ai/providers";
import { AnnotationItem, annotationOriginal, checkAnnotated, intersectsProtected, LanguageCategory, LTMatch, protectedRanges, THESIS_DEFAULT_DISABLED_RULES } from "@/lib/language/languagetool";
import { academicStyleSuggestions, provenanceFor } from "@/lib/language/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ParagraphIn {
  key: string;
  parts: AnnotationItem[];
}

interface Body {
  thesisId: string;
  paragraphs: ParagraphIn[];
  includeStyle?: boolean;
  sessionId?: string;
}

export interface LanguageSuggestionOut {
  id: string;
  /** Offsets within the paragraph's original (text + markup) string. */
  from: number;
  to: number;
  replacement: string;
  category: LanguageCategory;
  message: string;
  shortMessage?: string;
  ruleId: string;
  source: "lt" | "llm";
  provenance: "human" | "ai";
  /** All replacements LanguageTool offered (first one is `replacement`). */
  alternatives?: string[];
}

const MAX_PARAGRAPHS = 40;
const MAX_STYLE_PARAGRAPHS = 8;
const MAX_PARAGRAPH_CHARS = 20000;
const PARALLEL = 3;

const slug = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 40);

function sanitizeParts(parts: unknown): AnnotationItem[] | null {
  if (!Array.isArray(parts) || !parts.length) return null;
  const out: AnnotationItem[] = [];
  let chars = 0;
  for (const p of parts) {
    if (!p || typeof p !== "object") return null;
    const o = p as Record<string, unknown>;
    if (typeof o.text === "string") {
      if (!o.text) continue;
      out.push({ text: o.text });
      chars += o.text.length;
    } else if (typeof o.markup === "string") {
      if (!o.markup) continue;
      out.push({ markup: o.markup, interpretAs: typeof o.interpretAs === "string" ? o.interpretAs.slice(0, 20) : "" });
      chars += o.markup.length;
    } else return null;
    if (chars > MAX_PARAGRAPH_CHARS) return null;
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * POST /api/language/check
 * Body: { thesisId, paragraphs: [{ key, parts: ({ text } | { markup, interpretAs? })[] }], includeStyle?, sessionId? }
 * Returns: { paragraphs: [{ key, suggestions: LanguageSuggestionOut[] }], language, style?: { ran, skipped?, error? }, error? }
 * LanguageTool-only checks are not AI interactions; one interaction (mode "grammar") is logged only when the style layer ran.
 */
export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.thesisId !== "string" || !Array.isArray(body.paragraphs)) return error("thesisId and paragraphs are required");
  const thesis = canAccessThesis(user, body.thesisId);
  if (!thesis) return error("Thesis not found", 404);

  const paragraphs: ParagraphIn[] = [];
  for (const p of body.paragraphs.slice(0, MAX_PARAGRAPHS)) {
    if (!p || typeof p !== "object" || typeof (p as ParagraphIn).key !== "string") continue;
    const parts = sanitizeParts((p as ParagraphIn).parts);
    if (!parts) continue;
    paragraphs.push({ key: (p as ParagraphIn).key.slice(0, 64), parts });
  }

  const prefs = db.languagePrefs.get(thesis.id);
  const muted = new Set(prefs.mutedCategories as LanguageCategory[]);
  const mutedRules = new Set(prefs.mutedRules.map((x) => x.toUpperCase()));
  const dictionary = new Set(prefs.dictionary.map((w) => w.toLowerCase()));
  const disabledRules = Array.from(new Set([...THESIS_DEFAULT_DISABLED_RULES, ...prefs.mutedRules]));
  const langCode = prefs.language || "auto";
  const styleLang = langCode.startsWith("en") ? "en" : langCode === "auto" ? "en" : langCode;

  let ltError: string | undefined;
  let detected: string | undefined;

  // Auto-detect once, on the longest paragraph: per-paragraph detection misreads headings and table cells
  // (a two-word heading can come back as any language). Fall back to en-US when nothing is long enough.
  let effectiveLang = langCode;
  const wordsOf = (parts: AnnotationItem[]) => annotationOriginal(parts).trim().split(/\s+/).filter(Boolean).length;
  if (langCode === "auto") {
    const longest = paragraphs.slice().sort((a, b) => wordsOf(b.parts) - wordsOf(a.parts))[0];
    if (longest && wordsOf(longest.parts) >= 12) {
      const probe = await checkAnnotated(longest.parts, { language: "auto", motherTongue: prefs.motherTongue, disabledRules });
      const code = probe.language?.detectedCode || probe.language?.code;
      if (code) {
        const base = code.toLowerCase().split("-")[0];
        effectiveLang = base === "es" ? "es" : base === "fr" ? "fr" : code.toLowerCase() === "en-gb" ? "en-GB" : "en-US";
        detected = effectiveLang;
      } else effectiveLang = "en-US";
    } else effectiveLang = "en-US";
  }

  const ltResults = await mapLimit(paragraphs, PARALLEL, async (p) => {
    // Very short blocks (headings, table cells, labels) are not checked: almost every hit there is noise.
    if (wordsOf(p.parts) < 3) return [] as LTMatch[];
    const res = await checkAnnotated(p.parts, { language: effectiveLang, motherTongue: prefs.motherTongue, disabledRules });
    if (res.error && !ltError) ltError = res.error;
    if (res.language?.code && !detected) detected = res.language.code;
    return res.matches;
  });

  const out = paragraphs.map((p, i) => {
    const original = annotationOriginal(p.parts);
    const protectedR = protectedRanges(p.parts);
    const suggestions: LanguageSuggestionOut[] = [];
    const seen = new Set<string>();
    for (const m of ltResults[i] as LTMatch[]) {
      const from = m.offset;
      const to = m.offset + m.length;
      if (m.length <= 0 || to > original.length) continue;
      if (intersectsProtected(from, to, protectedR)) continue;
      if (muted.has(m.category) || mutedRules.has(m.rule.id.toUpperCase())) continue;
      const covered = original.slice(from, to);
      if (m.category === "spelling" && dictionary.has(covered.toLowerCase().replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, ""))) continue;
      const replacement = m.replacements[0];
      if (replacement === undefined) continue; // nothing actionable to accept
      const id = `${p.key}.${from}.${slug(m.rule.id)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      suggestions.push({
        id,
        from,
        to,
        replacement,
        category: m.category,
        message: m.message,
        shortMessage: m.shortMessage || undefined,
        ruleId: m.rule.id,
        source: "lt",
        provenance: provenanceFor({ category: m.category, source: "lt", original: covered, replacement }),
        alternatives: m.replacements.length > 1 ? m.replacements : undefined,
      });
    }
    return { key: p.key, original, protectedR, suggestions };
  });

  // ---------- Optional academic-style layer (the only part that is an AI interaction) ----------
  let style: { ran: boolean; skipped?: string; error?: string; provider?: string; model?: string; billedTo?: string } | undefined;
  if (body.includeStyle && !muted.has("style")) {
    const policy = db.policies.get(user.university);
    const consent = db.consents.latest(user.id);
    if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) style = { ran: false, skipped: "consent_required" };
    else if (!policy.allowedModes.includes("grammar")) style = { ran: false, skipped: "mode_not_allowed" };
    else {
      const cfg = resolveProvider(user, policy, null);
      const targets = out.filter((p) => p.original.trim().split(/\s+/).length >= 8).slice(0, MAX_STYLE_PARAGRAPHS);
      const usage = { inputTokens: 0, outputTokens: 0 };
      let styleError: string | undefined;
      const results = await mapLimit(targets, 2, (p) => academicStyleSuggestions(p.original, styleLang, cfg));
      results.forEach((res, i) => {
        usage.inputTokens += res.usage.inputTokens;
        usage.outputTokens += res.usage.outputTokens;
        if (res.error && !styleError) styleError = res.error;
        const p = targets[i];
        for (const s of res.suggestions) {
          const from = s.offset;
          const to = s.offset + s.original.length;
          if (intersectsProtected(from, to, p.protectedR)) continue;
          if (p.suggestions.some((x) => from < x.to && to > x.from)) continue; // LanguageTool already covers it
          const id = `${p.key}.${from}.llm_style`;
          p.suggestions.push({ id, from, to, replacement: s.replacement, category: "style", message: s.reason, ruleId: "LLM_ACADEMIC_STYLE", source: "llm", provenance: provenanceFor({ category: "style", source: "llm", original: s.original, replacement: s.replacement }) });
        }
      });
      const interaction = db.interactions.create({
        userId: user.id,
        thesisId: thesis.id,
        sessionId: body.sessionId,
        provider: cfg.provider,
        model: cfg.model,
        mode: "grammar",
        source: "thesisfic",
        connectionId: cfg.connectionId,
        promptPreview: `Language review: ${targets.length} paragraph${targets.length === 1 ? "" : "s"}`,
        responsePreview: `${results.reduce((n, x) => n + x.suggestions.length, 0)} style suggestions`,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        insertedWords: 0,
        blockedByPolicy: false,
        billedTo: cfg.billedTo,
        costUsd: costOf(cfg, usage),
        institutionModelId: cfg.institutionModel?.id,
        responseFingerprints: [],
      });
      if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
      if (cfg.billedTo === "institution") maybeAlertBudget(user.university);
      style = { ran: true, error: styleError, provider: cfg.provider, model: cfg.model, billedTo: cfg.billedTo, ...(interaction ? { interactionId: interaction.id } : {}) } as typeof style & { interactionId?: string };
    }
  }

  for (const p of out) p.suggestions.sort((a, b) => a.from - b.from);
  const response = {
    paragraphs: out.map((p) => ({ key: p.key, suggestions: p.suggestions })),
    language: detected || langCode,
    style,
    error: ltError,
  };
  if (ltError && !out.some((p) => p.suggestions.length)) return NextResponse.json(response, { status: 200 });
  return json(response);
}
