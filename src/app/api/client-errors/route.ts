import { NextRequest, NextResponse } from "next/server";

/**
 * Receives a client-side crash report from the editor's error boundary and writes it to the server log, where the
 * team can read it (Vercel runtime logs). No body is stored: the report is for diagnosis only.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { message?: string; stack?: string; componentStack?: string; url?: string; userAgent?: string; context?: string };
    const line = {
      kind: "client-error",
      context: String(body.context || "").slice(0, 120),
      message: String(body.message || "").slice(0, 1000),
      stack: String(body.stack || "").slice(0, 4000),
      componentStack: String(body.componentStack || "").slice(0, 2000),
      url: String(body.url || "").slice(0, 300),
      userAgent: String(body.userAgent || "").slice(0, 300),
      at: new Date().toISOString(),
    };
    console.error("[client-error]", JSON.stringify(line));
  } catch {
    // a malformed report is not worth an error of its own
  }
  return NextResponse.json({ ok: true });
}
