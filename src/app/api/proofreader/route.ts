import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// Simulated proofreading - in production, would use Claude or a dedicated grammar API
export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { text } = body;
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  // Simulated suggestions
  const suggestions = [
    { type: "grammar", original: "data which is", replacement: "data that are", explanation: "Use 'that' for restrictive clauses in academic writing. 'Data' is plural.", position: text.indexOf("data which is"), severity: "error" },
    { type: "clarity", original: "very important", replacement: "critical", explanation: "Avoid intensifiers like 'very' in academic writing. Use a stronger word.", position: text.indexOf("very important"), severity: "warning" },
    { type: "tone", original: "pretty good", replacement: "satisfactory", explanation: "Use formal language in academic writing instead of colloquial expressions.", position: text.indexOf("pretty good"), severity: "warning" },
    { type: "conciseness", original: "in order to", replacement: "to", explanation: "'In order to' can usually be shortened to 'to' without losing meaning.", position: text.indexOf("in order to"), severity: "info" },
    { type: "academic_style", original: "a lot of", replacement: "numerous", explanation: "Replace informal quantifiers with precise academic alternatives.", position: text.indexOf("a lot of"), severity: "warning" },
  ].filter((s) => s.position >= 0);

  const score = Math.max(60, 100 - suggestions.length * 8);

  return NextResponse.json({
    suggestions,
    score,
    summary: {
      grammar: suggestions.filter((s) => s.type === "grammar").length,
      clarity: suggestions.filter((s) => s.type === "clarity").length,
      tone: suggestions.filter((s) => s.type === "tone").length,
      conciseness: suggestions.filter((s) => s.type === "conciseness").length,
      academic_style: suggestions.filter((s) => s.type === "academic_style").length,
    },
  });
}
