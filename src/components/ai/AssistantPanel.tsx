"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Copy, FilePlus2, History, Plus, Send, Square, Trash2, Wand2 } from "lucide-react";
import Markdown, { markdownToHtml } from "../Markdown";
import { api, ApiError, countWordsInText, streamChat, timeAgo } from "@/lib/client";

export type AIMode = "chat" | "brainstorm" | "outline" | "critique" | "grammar" | "summarize" | "explain" | "citations" | "gaps" | "paraphrase_check" | "copilot";

interface ModeInfo {
  id: AIMode;
  label: string;
  description: string;
  icon: string;
  insertable: boolean;
}

interface ProviderInfo {
  id: string;
  name: string;
  product: string;
  color: string;
  allowedByPolicy: boolean;
  platformKey: boolean;
  connection: { id: string; label: string; status: string; model?: string } | null;
}

interface InstitutionModelInfo {
  id: string;
  provider: string;
  label: string;
  model: string;
  backendName: string;
  region: string;
  isDefault: boolean;
  ready: boolean;
  color: string;
}

interface AllowanceInfo {
  institutionPays: boolean;
  currency: string;
  perStudentMonthly: number;
  spentStudent: number;
  atLimit: "block" | "own_account";
  exhausted: "none" | "student" | "institution";
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: AIMode;
  provider?: string;
  model?: string;
  label?: string;
  interactionId?: string;
  blocked?: boolean;
  streaming?: boolean;
  error?: string;
  demo?: boolean;
  billedTo?: string;
  notice?: string;
  createdAt: string;
}

export interface InsertMeta {
  provider: string;
  model: string;
  mode: string;
  interactionId?: string;
  words: number;
}

export interface AssistantPanelProps {
  thesisId?: string;
  sessionId?: string;
  selection?: string;
  onInsert?: (html: string, meta: InsertMeta) => void;
  onReplaceSelection?: (html: string, meta: InsertMeta) => void;
  onConsentRequired?: () => void;
  onRejectSuggestion?: (meta: { provider: string; mode: string }) => void;
  variant?: "panel" | "page";
  initialMode?: AIMode;
  initialConversationId?: string;
  className?: string;
}

const QUICK: Record<AIMode, string[]> = {
  chat: ["How do I narrow my research question?", "What makes a strong thesis statement?", "How should I respond to a reviewer who disagrees with my method?"],
  brainstorm: ["Give me angles on the limitations of my approach", "What counter-arguments should I anticipate?", "Research questions around my topic"],
  outline: ["Outline my literature review", "Structure the methodology chapter", "Outline the discussion of results"],
  critique: ["Critique the selected passage", "Is my argument in this section convincing?", "Where is the evidence thin?"],
  grammar: ["Correct the grammar of the selected passage", "Make this paragraph more concise", "Check academic tone"],
  summarize: ["Summarize this source in 5 bullets", "Summarize my introduction", "Key claims of the selected text"],
  explain: ["Explain mixed-methods triangulation", "What is a p-value, really?", "Explain grounded theory coding"],
  citations: ["Format this reference in APA 7", "In-text citation for three authors", "How do I cite a dataset?"],
  gaps: ["Find gaps in the selected section", "What evidence is missing here?", "Which claims are unsupported?"],
  paraphrase_check: ["Is my paraphrase too close to the source?", "Check this passage against its source", "Is this citation adequate?"],
  copilot: ["Which statistical test fits my design?", "Explain how to run a systematic review search", "Help me plan the next 4 weeks of my research", "What are the strongest objections to my method?"],
};

export default function AssistantPanel({ thesisId, sessionId, selection, onInsert, onReplaceSelection, onConsentRequired, onRejectSuggestion, variant = "panel", initialMode = "chat", initialConversationId, className = "" }: AssistantPanelProps) {
  const [modes, setModes] = useState<ModeInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [institutionModels, setInstitutionModels] = useState<InstitutionModelInfo[]>([]);
  const [allowance, setAllowance] = useState<AllowanceInfo | null>(null);
  const [mode, setMode] = useState<AIMode>(initialMode);
  const [providerChoice, setProviderChoice] = useState<string>("auto");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useSelection, setUseSelection] = useState(true);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [conversations, setConversations] = useState<{ id: string; title: string; updatedAt: string; messageCount: number }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [inserted, setInserted] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ providers: ProviderInfo[]; modes: ModeInfo[]; defaultProvider: string | null; institutionModels?: InstitutionModelInfo[]; allowance?: AllowanceInfo | null }>("/api/ai/providers")
      .then((d) => {
        setProviders(d.providers);
        setModes(d.modes);
        setInstitutionModels(d.institutionModels || []);
        setAllowance(d.allowance || null);
      })
      .catch(() => {});
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const d = await api<{ conversations: typeof conversations }>(`/api/ai/conversations${thesisId ? `?thesisId=${thesisId}` : ""}`);
      setConversations(d.conversations);
    } catch {
      /* ignore */
    }
  }, [thesisId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialConversationId) return;
    api<{ conversation: { messages: { id: string; role: "user" | "assistant"; content: string; mode?: AIMode; provider?: string; model?: string; createdAt: string }[] } }>(`/api/ai/conversations/${initialConversationId}`)
      .then((d) => setMessages(d.conversation.messages.map((m) => ({ ...m }))))
      .catch(() => {});
  }, [initialConversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const currentMode = useMemo(() => modes.find((m) => m.id === mode), [modes, mode]);
  const selectionWords = selection ? countWordsInText(selection) : 0;
  const connected = providers.filter((p) => p.connection && p.connection.status === "active");
  const activeProvider = providers.find((p) => p.id === providerChoice);
  const activeInstitution = institutionModels.find((m) => m.id === providerChoice);
  const readyInstitution = institutionModels.filter((m) => m.ready);
  const defaultInstitution = readyInstitution.find((m) => m.isDefault) || readyInstitution[0];
  const allowanceUsed = allowance && allowance.perStudentMonthly > 0 ? Math.min(100, Math.round((allowance.spentStudent / allowance.perStudentMonthly) * 100)) : null;
  const autoLabel = allowance?.institutionPays && defaultInstitution && allowance.exhausted === "none" ? `${defaultInstitution.label} · paid by your university` : connected[0] ? `Your ${connected[0].product} account` : "Institution assistant";
  const chipLabel = providerChoice === "auto" ? "Auto" : activeInstitution ? activeInstitution.label.split(" (")[0] : activeProvider?.product.split(" ")[0];
  const chipColor = activeInstitution?.color || activeProvider?.color || "#5c7cfa";

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: "user", content, mode, createdAt: new Date().toISOString() };
    const asstId = `a_${Date.now()}`;
    const asst: ChatMsg = { id: asstId, role: "assistant", content: "", mode, streaming: true, createdAt: new Date().toISOString() };
    const history = messages.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg, asst]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: Partial<ChatMsg>) => setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, ...patch } : m)));
    try {
      await streamChat(
        {
          messages: [...history, { role: "user", content }],
          mode,
          thesisId,
          sessionId,
          conversationId,
          provider: providerChoice === "auto" ? null : providerChoice,
          selection: useSelection && selection ? selection : undefined,
        },
        {
          onMeta: (meta) => {
            if (meta.conversationId) setConversationId(String(meta.conversationId));
            update({ provider: String(meta.provider), model: String(meta.model), label: String(meta.label), blocked: !!meta.blocked, demo: !!meta.demo, billedTo: meta.billedTo ? String(meta.billedTo) : undefined, notice: meta.notice ? String(meta.notice) : undefined });
            if (meta.billedTo === "institution") setAllowance((a) => (a ? { ...a } : a));
          },
          onDelta: (t) => setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: m.content + t } : m))),
          onDone: (d) => {
            update({ streaming: false, interactionId: d.interactionId });
            if (allowance) api<{ allowance?: AllowanceInfo | null }>("/api/ai/providers").then((x) => setAllowance(x.allowance || null)).catch(() => {});
          },
          onError: (e) => update({ streaming: false, error: e.message }),
        },
        controller.signal
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") update({ streaming: false });
      else if (e instanceof ApiError && e.code === "consent_required") {
        update({ streaming: false, error: e.message });
        onConsentRequired?.();
      } else update({ streaming: false, error: (e as Error).message });
    } finally {
      setLoading(false);
      abortRef.current = null;
      loadConversations();
      inputRef.current?.focus();
    }
  };

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    setMessages([]);
    setConversationId(undefined);
    setHistoryOpen(false);
  };

  const openConversation = async (id: string) => {
    setHistoryOpen(false);
    try {
      const d = await api<{ conversation: { messages: ChatMsg[] } }>(`/api/ai/conversations/${id}`);
      setConversationId(id);
      setMessages(d.conversation.messages);
    } catch {
      /* ignore */
    }
  };

  const deleteConversation = async (id: string) => {
    await api(`/api/ai/conversations?id=${id}`, { method: "DELETE" }).catch(() => {});
    if (id === conversationId) newChat();
    loadConversations();
  };

  const copy = async (m: ChatMsg) => {
    await navigator.clipboard.writeText(m.content).catch(() => {});
    setCopied(m.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const insert = (m: ChatMsg, replace = false) => {
    const html = markdownToHtml(m.content);
    const meta: InsertMeta = { provider: m.provider || "demo", model: m.model || "", mode: m.mode || mode, interactionId: m.interactionId, words: countWordsInText(m.content) };
    if (replace) onReplaceSelection?.(html, meta);
    else onInsert?.(html, meta);
    setInserted(m.id);
    setTimeout(() => setInserted(null), 1500);
  };

  const isPage = variant === "page";

  return (
    <div className={`flex flex-col h-full min-h-0 bg-white ${className}`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
        <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-accent-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">Thesisfic AI</div>
          <div className="text-[11px] text-gray-400 truncate">{providerChoice === "auto" ? autoLabel : activeInstitution ? `${activeInstitution.label} · paid by your university` : activeProvider?.connection?.label || activeProvider?.product} · logged for integrity</div>
        </div>
        <div className="relative">
          <button onClick={() => setProviderOpen((o) => !o)} className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-1" title="Choose AI provider">
            <span className="w-2 h-2 rounded-full" style={{ background: chipColor }} />
            {chipLabel}
            <ChevronDown className="w-3 h-3" />
          </button>
          {providerOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-20 py-1 text-sm">
              <button onClick={() => { setProviderChoice("auto"); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${providerChoice === "auto" ? "text-brand-600 font-medium" : ""}`}>
                Auto {allowance?.institutionPays && readyInstitution.length ? "(university models first)" : "(your account first)"}
              </button>
              {allowance?.institutionPays && institutionModels.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">Paid by your university</div>
                  {allowanceUsed !== null && <div className="px-3 pb-1 text-[11px] text-gray-500">{allowance.spentStudent.toFixed(2)} / {allowance.perStudentMonthly} {allowance.currency} used this month</div>}
                  {allowanceUsed !== null && (
                    <div className="mx-3 mb-1 h-1 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${allowanceUsed >= 100 ? "bg-red-500" : allowanceUsed >= 80 ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${allowanceUsed}%` }} /></div>
                  )}
                  {institutionModels.map((m) => (
                    <button key={m.id} disabled={!m.ready || allowance.exhausted !== "none"} onClick={() => { setProviderChoice(m.id); setProviderOpen(false); }} title={`${m.backendName} · ${m.region}`} className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40 ${providerChoice === m.id ? "text-brand-600 font-medium" : ""}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span className="flex-1 truncate">{m.label}</span>
                      <span className="text-[10px] text-gray-400">{!m.ready ? "not configured" : allowance.exhausted !== "none" ? "allowance used" : m.region}</span>
                    </button>
                  ))}
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">Your own accounts</div>
                </>
              )}
              {providers.map((p) => (
                <button key={p.id} disabled={!p.allowedByPolicy} onClick={() => { setProviderChoice(p.id); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40 ${providerChoice === p.id ? "text-brand-600 font-medium" : ""}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="flex-1">{p.product}</span>
                  <span className="text-[10px] text-gray-400">{p.connection ? "your account" : p.platformKey ? "institution" : !p.allowedByPolicy ? "not allowed" : "demo"}</span>
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <a href="/dashboard/connections" className="block px-3 py-2 text-xs text-brand-600 hover:bg-gray-50">
                  Connect your Claude / ChatGPT / Gemini account →
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setHistoryOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Conversation history">
            <History className="w-4 h-4" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-20 max-h-80 overflow-y-auto text-sm">
              <button onClick={newChat} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-brand-600 font-medium border-b border-gray-100">
                <Plus className="w-4 h-4" /> New conversation
              </button>
              {conversations.length === 0 && <div className="px-3 py-4 text-xs text-gray-400">No conversations yet.</div>}
              {conversations.map((c) => (
                <div key={c.id} className={`flex items-center gap-1 px-2 py-1.5 hover:bg-gray-50 ${c.id === conversationId ? "bg-brand-50" : ""}`}>
                  <button onClick={() => openConversation(c.id)} className="flex-1 text-left min-w-0">
                    <div className="truncate text-xs font-medium">{c.title}</div>
                    <div className="text-[10px] text-gray-400">{c.messageCount} messages · {timeAgo(c.updatedAt)}</div>
                  </button>
                  <button onClick={() => deleteConversation(c.id)} className="p-1 text-gray-300 hover:text-red-500" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={newChat} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="New conversation">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Modes */}
      <div className="px-2 py-1.5 border-b border-gray-100 flex gap-1 overflow-x-auto flex-shrink-0 no-scrollbar">
        {(modes.length ? modes : [{ id: "chat", label: "Ask", icon: "💬", description: "", insertable: false } as ModeInfo]).map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} title={m.description} className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${mode === m.id ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-brand-300"}`}>
            <span className="mr-1">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {mode === "copilot" && (
        <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 flex-shrink-0">
          <strong>Research copilot</strong>, provided by your university. Ask anything about your research. The history is kept and visible to your institution; it will not write your thesis, and sentences you copy from it into your thesis are marked as AI-assisted.
        </div>
      )}

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 ${isPage ? "max-w-3xl w-full mx-auto" : ""}`}>
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 space-y-3 pt-2">
            <p>
              <strong>{currentMode?.label || "Ask"}</strong>
              {currentMode?.description ? ` — ${currentMode.description.toLowerCase()}.` : "."} {mode === "copilot" ? "Go as deep as you need; writing stays yours." : "I help you think and revise; I never write your thesis for you."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK[mode].map((q) => (
                <button key={q} onClick={() => send(q)} className="text-xs px-2.5 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 text-left">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`${m.role === "user" ? "ml-8" : "mr-2"}`}>
            {m.role === "assistant" && (
              <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400">
                <Bot className="w-3 h-3" />
                <span>{m.label || "Thesisfic AI"}</span>
                {m.model && <span>· {m.model}</span>}
                {m.blocked && <span className="badge-danger !text-[10px] !py-0">blocked by policy</span>}
                {m.demo && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">demo</span>}
                {m.billedTo === "institution" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px] !py-0">paid by university</span>}
                {m.billedTo === "student" && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">your account</span>}
              </div>
            )}
            {m.role === "assistant" && m.notice && !m.error && <div className="mb-1 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">{m.notice}</div>}
            <div className={`text-sm leading-relaxed rounded-xl px-3 py-2 ${m.role === "user" ? "bg-brand-600 text-white rounded-br-sm whitespace-pre-wrap" : m.blocked ? "bg-amber-50 border border-amber-100 rounded-bl-sm" : "bg-gray-50 rounded-bl-sm"}`}>
              {m.role === "user" ? m.content : <Markdown text={m.content || (m.streaming ? "…" : "")} />}
              {m.error && <div className="mt-2 text-xs text-red-600">{m.error}</div>}
              {m.streaming && <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />}
            </div>
            {m.role === "assistant" && !m.streaming && m.content && (
              <div className="flex items-center gap-1 mt-1">
                <button onClick={() => copy(m)} className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-500 flex items-center gap-1">
                  {copied === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied === m.id ? "Copied" : "Copy"}
                </button>
                {onInsert && !m.blocked && (
                  <button onClick={() => insert(m)} className="text-[11px] px-1.5 py-0.5 rounded hover:bg-brand-50 text-brand-600 flex items-center gap-1" title="Insert at cursor, marked as AI-assisted">
                    {inserted === m.id ? <Check className="w-3 h-3" /> : <FilePlus2 className="w-3 h-3" />} Insert (AI-marked)
                  </button>
                )}
                {onReplaceSelection && selection && !m.blocked && (m.mode === "grammar" || m.mode === "summarize") && (
                  <button onClick={() => insert(m, true)} className="text-[11px] px-1.5 py-0.5 rounded hover:bg-brand-50 text-brand-600 flex items-center gap-1" title="Replace the selected passage">
                    <Wand2 className="w-3 h-3" /> Replace selection
                  </button>
                )}
                {onRejectSuggestion && !m.blocked && (m.mode === "grammar" || m.mode === "outline") && (
                  <button onClick={() => onRejectSuggestion({ provider: m.provider || "demo", mode: m.mode || "chat" })} className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400">
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Selection chip */}
      {selection && (
        <div className="px-3 pb-1 flex-shrink-0">
          <label className="flex items-center gap-2 text-[11px] text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
            <input type="checkbox" checked={useSelection} onChange={(e) => setUseSelection(e.target.checked)} className="rounded" />
            Use selected text ({selectionWords} words) as context
          </label>
        </div>
      )}

      {/* Input */}
      <div className={`p-2 border-t border-gray-100 flex-shrink-0 ${isPage ? "max-w-3xl w-full mx-auto" : ""}`}>
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200 focus-within:border-brand-400">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(140, e.target.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`${currentMode?.label || "Ask"}… (Enter to send, Shift+Enter for a new line)`}
            className="flex-1 bg-transparent resize-none text-sm focus:outline-none max-h-[140px]"
          />
          {loading ? (
            <button onClick={stop} className="p-2 rounded-lg bg-gray-200 text-gray-700" title="Stop">
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()} className="p-2 rounded-lg bg-brand-600 text-white disabled:opacity-30" title="Send">
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="text-[10px] text-gray-400 mt-1 px-1">Answers are guidance, not thesis text. Anything you insert is marked as AI-assisted and counts toward your institution&apos;s AI limit.</div>
      </div>
    </div>
  );
}
