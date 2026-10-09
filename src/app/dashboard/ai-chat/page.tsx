"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Compass, History, Plus, Trash2 } from "lucide-react";
import DashboardLayout, { useTimeAgo } from "@/components/DashboardLayout";
import AssistantPanel, { AIMode } from "@/components/ai/AssistantPanel";
import ConsentModal from "@/components/ConsentModal";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";
import { useT } from "@/lib/i18n/client";

const MODE_IDS = ["chat", "brainstorm", "outline", "critique", "grammar", "summarize", "explain", "citations", "gaps", "paraphrase_check", "copilot"];

interface ConversationRow {
  id: string;
  title: string;
  thesisId?: string;
  mode?: AIMode;
  messageCount: number;
  updatedAt: string;
}

function AIChatInner() {
  const { me, refresh } = useUser();
  const t = useT();
  const timeAgo = useTimeAgo();
  const modeLabel = (id: string) => (MODE_IDS.indexOf(id) !== -1 ? t(`assistant.mode.${id}.label`) : id);
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
      const active = d.theses.find((x) => x.status === "in_progress") || d.theses[0];
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
    if (!window.confirm(t("dashboard.chat.deleteConfirm"))) return;
    await api(`/api/ai/conversations?id=${id}`, { method: "DELETE" }).catch(() => {});
    if (id === conversationId) open(undefined);
    loadConversations();
  };
  const copilotConvs = conversations.filter((c) => c.mode === "copilot");

  return (
    <DashboardLayout fullBleed>
      <div className="h-[calc(100dvh-3.5rem-4.5rem)] lg:h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
          <div className="text-sm font-semibold flex items-center gap-2">{copilot ? <><Compass className="w-4 h-4 text-accent-600" />{t("glossary.assistant")} · {t("glossary.copilot")}</> : t("glossary.assistant")}</div>
          <select value={thesisId || ""} onChange={(e) => { setThesisId(e.target.value || undefined); open(undefined); }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 max-w-[60vw]">
            <option value="">{t("dashboard.chat.noThesis")}</option>
            {theses.map((th) => <option key={th.id} value={th.id}>{th.title}</option>)}
          </select>
        </div>
        <div className="flex-1 min-h-0 flex">
          {/* History */}
          <aside className="hidden lg:flex w-72 flex-shrink-0 border-r border-gray-100 bg-gray-50/60 flex-col">
            <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />{t("dashboard.chat.history")}</div>
              <button onClick={() => open(undefined)} className="text-xs text-brand-600 font-medium flex items-center gap-1 hover:underline"><Plus className="w-3.5 h-3.5" />{t("dashboard.chat.new")}</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 && <div className="p-4 text-xs text-gray-400">{t("dashboard.chat.empty")} {copilot ? t("dashboard.chat.emptyCopilot") : t("dashboard.chat.emptyDefault")}</div>}
              {/* One list per assistant function, copilot first */}
              {["copilot", ...MODE_IDS.filter((m) => m !== "copilot")].filter((m) => conversations.some((c) => (c.mode || "chat") === m)).map((m) => (
              <div key={m}>
              <div className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.06em] border-b border-gray-100 ${m === "copilot" ? "text-accent-700 bg-accent-50/60" : "text-gray-400 bg-gray-50"}`}>{modeLabel(m)}</div>
              {conversations.filter((c) => (c.mode || "chat") === m).map((c) => (
                <div key={c.id} className={`group flex items-start gap-1 px-3 py-2 border-b border-gray-100 hover:bg-white cursor-pointer ${c.id === conversationId ? "bg-white border-l-2 border-l-brand-500" : ""}`} onClick={() => open(c.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{c.title}</div>
                    <div className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
                      <span className={`px-1 rounded ${c.mode === "copilot" ? "bg-accent-50 text-accent-700" : "bg-gray-100 text-gray-500"}`}>{modeLabel(c.mode || "chat")}</span>
                      <span>{t("dashboard.chat.messages", { n: c.messageCount })} · {timeAgo(c.updatedAt)}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" title={t("common.delete")} aria-label={t("common.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              </div>
              ))}
            </div>
            {copilot && (
              <div className="p-3 border-t border-gray-100 text-[11px] text-gray-500">
                {copilotConvs.length === 1 ? t("dashboard.chat.copilotKept_one") : t("dashboard.chat.copilotKept", { n: copilotConvs.length })} {t("dashboard.chat.copilotNote")}
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
