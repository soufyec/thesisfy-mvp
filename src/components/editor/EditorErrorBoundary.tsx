"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Catches a render crash inside the editor and shows the real error instead of Next's blank "Application error"
 * screen, so the message can be read and reported; the same report is sent to /api/client-errors for the server log.
 * The document is not lost: autosave has already run, and Reload restores the last saved state.
 */
export default class EditorErrorBoundary extends Component<{ children: ReactNode; context?: string }, { error: Error | null; info: ErrorInfo | null }> {
  state = { error: null as Error | null, info: null as ErrorInfo | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    try {
      fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: this.props.context || "editor", message: error.message, stack: error.stack, componentStack: info.componentStack, url: location.href, userAgent: navigator.userAgent }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // reporting must never throw
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen error={this.state.error} info={this.state.info} />;
  }
}

function CrashScreen({ error, info }: { error: Error; info: ErrorInfo | null }) {
  const t = useT();
  const details = `${error.name}: ${error.message}\n${(error.stack || "").split("\n").slice(1, 8).join("\n")}${info?.componentStack ? `\n\n${info.componentStack.split("\n").slice(0, 8).join("\n")}` : ""}`;
  return (
    <div role="alert" className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t("editor.crash.title")}</h1>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">{t("editor.crash.body")}</p>
        <pre className="text-[12px] leading-[1.5] bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-auto max-h-72 whitespace-pre-wrap break-words text-gray-800">{details}</pre>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => location.reload()} className="btn-primary">{t("editor.crash.reload")}</button>
          <button type="button" onClick={() => { try { navigator.clipboard.writeText(details); } catch {} }} className="btn-outline">{t("editor.crash.copy")}</button>
        </div>
      </div>
    </div>
  );
}
