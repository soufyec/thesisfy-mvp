import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// Simulated academic paraphraser - in production, would use Claude API
export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { text, style = "academic" } = body;
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  // Simulated paraphrases for demo
  const paraphrases: Record<string, string[]> = {
    academic: [
      `The present analysis demonstrates that ${text.toLowerCase().replace(/^the |^this |^our /i, "the aforementioned ")}`,
      `It has been established through systematic investigation that ${text.toLowerCase().replace(/shows?|demonstrates?/i, "indicates")}`,
      `The empirical evidence suggests that ${text.toLowerCase().replace(/good|great|excellent/i, "satisfactory").replace(/bad|poor/i, "suboptimal")}`,
    ],
    formal: [
      `${text.replace(/pretty|quite|very/gi, "").replace(/shows?/i, "demonstrates").replace(/big/i, "substantial")}`,
      `${text.replace(/a lot of/gi, "numerous").replace(/get/gi, "obtain").replace(/use/gi, "utilize")}`,
    ],
    concise: [
      `${text.replace(/in order to/gi, "to").replace(/due to the fact that/gi, "because").replace(/at this point in time/gi, "now")}`,
    ],
  };

  const options = paraphrases[style] || paraphrases.academic;

  return NextResponse.json({
    original: text,
    paraphrases: options.map((p, i) => ({ id: `par_${i}`, text: p, style })),
    style,
  });
}
