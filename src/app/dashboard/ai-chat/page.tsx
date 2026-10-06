"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Compass, History, Plus, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import AssistantPanel, { AIMode } from "@/components/ai/AssistantPanel";
import ConsentModal from "@/components/ConsentModal";
import { useUser } from "@/components/useUser";
import { api, timeAgo } from "@/lib/client";

interface ConversationRow {
  id: string;
  title: string;
  thesisId?: string;
  mode?: AIMode;
  messageCount: number;
  updatedAt: string;
}

const MODE_LABEL: Record<string, string> = { copilot: "Research copilot", chat: "Ask", brainstorm: "Brainstorm", outline: "Outline", critique: "Critique", grammar: "Grammar", summarize: "Summarize", explain: "Explain", citations: "Citations", gaps: "Find gaps", paraphrase_check: "Paraphrase check" };

function AIChatInner() {
  const { me, refresh } = useUser();
  const params = useSearchParams();
  const requestedMode = params.get("mode") as AIMode | null;
  const [theses, setTheses] = useState<{ id: string; title: string }[]>([]);
  const [thesisId, setThesisId] = useState<string | undefined>(undefined);
  const [consentOpen, setConsentOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(params.get("conversation") || undefined);
  const [panelKey, setPanelKey] = useState(0);

  useEffect(() => {
    api<{ theses: { id: string; title: string; status: string }[] }>("/api/theses").then((d) => {
      setTheses(d.theses);
      const active = d.theses.find((t) => t.status === "in_progress") || d.theses[0];
      if (active) setThesisId(active.id);
    }).catch(() => {});
  }, []);

  const loadConversations = useCallback(() => api<{ conversations: ConversationRow[] }>("/api/ai/conversations").then((d) => setConversations(d.conversations)).catch(() => {}), []);
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (me && me.policy.requireConsent && !me.consent && me.user.role === "student") setConsentOpen(true);
  }, [me]);

  const copilot = !!me?.policy.researchCopilot;
  const open = (id?: string) => {
    setConversationId(id);
    setPanelKey((k) => k + 1);
  };
  const remove = async (id: string) => {
    await api(`/api/ai/conversations?id=${id}`, { method: "DELETE" }).catch(() => {});
    if (id === conversationId) open(undefined);
    loadConversations();
  };
  const copilotConvs = conversations.filter((c) => c.mode === "copilot");

  return (
    <DashboardLayout fullBleed>
      <div className="h-[calc(100dvh-3.5rem-4.5rem)] lg:h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
          <div className="text-sm font-semibold flex items-center gap-2">{copilot ? <><Compass className="w-4 h-4 text-emerald-600" />Research copilot</> : "AI Assistant"}</div>
          <select value={thesisId || ""} onChange={(e) => { setThesisId(e.target.value || undefined); open(undefined); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 max-w-[60vw]">
            <option value="">No thesis context</option>
            {theses.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <span className="text-[11px] text-gray-400 hidden sm:inline">{copilot ? "Provided by your university · every conversation is saved to your history" : "Context helps the assistant respect your citation style, word budget and AI limit."}</span>
        </div>
        <div className="flex-1 min-h-0 flex">
          {/* History */}
          <aside className="hidden lg:flex w-72 flex-shrink-0 border-r border-gray-100 bg-gray-50/60 flex-col">
            <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />History</div>
              <button onClick={() => open(undefined)} className="text-xs text-brand-600 font-medium flex items-center gap-1 hover:underline"><Plus className="w-3.5 h-3.5" />New</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 && <div className="p-4 text-xs text-gray-400">No conversations yet. {copilot ? "Ask the copilot anything about your research; it stays here." : "Start one on the right."}</div>}
              {conversations.map((c) => (
                <div key={c.id} className={`group flex items-start gap-1 px-3 py-2 border-b border-gray-100 hover:bg-white cursor-pointer ${c.id === conversationId ? "bg-white border-l-2 border-l-brand-500" : ""}`} onClick={() => open(c.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{c.title}</div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
                      <span className={`px-1 rounded ${c.mode === "copilot" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{MODE_LABEL[c.mode || "chat"] || c.mode}</span>
                      <span>{c.messageCount} msgs · {timeAgo(c.updatedAt)}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            {copilot && (
              <div className="p-3 border-t border-gray-100 text-[11px] text-gray-500">
                {copilotConvs.length} copilot conversation{copilotConvs.length === 1 ? "" : "s"} kept. Your institution can see this history; it never writes your thesis, and answer text pasted into it is marked as AI-assisted.
              </div>
            )}
          </aside>
          <div className="flex-1 min-w-0 min-h-0">
            {me && <AssistantPanel key={`${thesisId || "none"}-${conversationId || "new"}-${panelKey}`} thesisId={thesisId} variant="page" initialMode={requestedMode || (copilot ? "copilot" : undefined)} initialConversationId={conversationId} onConsentRequired={() => setConsentOpen(true)} onConversationsChanged={loadConversations} />}
          </div>
        </div>
      </div>
      {me && <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} policy={me.policy} existing={me.consent} onGranted={() => refresh()} />}
    </DashboardLayout>
  );
}

export default function AIChatPage() {
  return (
    <Suspense fallback={null}>
      <AIChatInner />
    </Suspense>
  );
}
