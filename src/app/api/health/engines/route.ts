import { NextRequest, NextResponse } from "next/server";
import { isTeamRequest } from "@/lib/team";
import { engineHeaders, privacyEndpoint, embedPrivate } from "@/lib/services/private-engines";
import { createPresidioAnalyzer } from "@/lib/services/pii-scrubber";
import { checkAnnotated } from "@/lib/language/languagetool";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
let cached: { at: number; data: Record<string, unknown> } | undefined;
/** Synthetic checks only. Preview is additionally protected by Vercel; production requires team session. */
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview" && !isTeamRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (cached && Date.now() - cached.at < 60000) return NextResponse.json(cached.data);
  const data: Record<string, unknown> = { privacy: false, language: false, embeddings: false };
  const url = privacyEndpoint();
  if (url) {
    try {
      const response = await fetch(new URL("/health", url), { headers: engineHeaders(), cache: "no-store", signal: AbortSignal.timeout(60000) });
      if (response.ok) {
        const spans = await createPresidioAnalyzer(url)("Contact alice@example.org in Paris.", "en");
        data.privacy = spans.some(s => s.entity === "EMAIL");
      }
    } catch { data.privacy = false; }
    try { const vectors = await embedPrivate(["Academic research methods"]); data.embeddings = vectors[0]?.length === 384; } catch { data.embeddings = false; }
  }
  try { const result = await checkAnnotated([{ text: "This are a research paper." }], { language: "en-US", timeoutMs: 30000 }); data.language = !result.error && result.matches.length > 0; } catch { data.language = false; }
  data.ready = data.privacy === true && data.language === true && data.embeddings === true;
  cached = { at: Date.now(), data };
  return NextResponse.json(data, { status: data.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
