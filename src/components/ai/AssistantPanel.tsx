"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookMarked,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Compass,
  Copy,
  FileText,
  GraduationCap,
  History,
  Lightbulb,
  List,
  type LucideIcon,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Markdown, { markdownToHtml } from "../Markdown";
import { api, ApiError, countWordsInText, streamChat, timeAgo } from "@/lib/client";

export type AIMode = "chat" | "brainstorm" | "outline" | "critique" | "grammar" | "summarize" | "explain" | "citations" | "gaps" | "paraphrase_check" | "copilot";

interface ModeInfo {
  id: AIMode;
  label: string;
  description: string;
  /** lucide-react icon name (see `MODES` in `src/lib/ai/prompts.ts`). */
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
  /** Starting mode. When omitted, the Research copilot is used if the institution offers it. */
  initialMode?: AIMode;
  initialConversationId?: string;
  className?: string;
  onConversationsChanged?: () => void;
  /** Thesis numbers for the cost card shown before any AI insertion (words, AI words, policy limit, who pays). */
  insertContext?: { wordCount: number; aiWords: number; limitPct: number; payer?: string };
  /** Clears the "Working on" selection in the host editor. */
  onClearSelection?: () => void;
  /** Adds the answer as a comment anchored to the current selection. */
  onAddComment?: (text: string) => void;
  /** Inserts the answer into the "Research notes" tab (created if missing), marked as AI-assisted. */
  onKeepAsNotes?: (html: string, meta: InsertMeta) => void;
}

/** Display labels used inside the panel (tiles, meta lines, placeholder). Short forms per the UI vocabulary. */
export const MODE_LABELS: Record<AIMode, string> = {
  copilot: "Research copilot",
  chat: "Ask",
  brainstorm: "Brainstorm",
  outline: "Outline",
  critique: "Critique",
  grammar: "Grammar",
  summarize: "Summarize",
  explain: "Explain",
  citations: "Citations",
  gaps: "Find gaps",
  paraphrase_check: "Paraphrase",
};

/** Noun used in the cost card: "Inserting this outline adds…". */
const INSERT_NOUN: Partial<Record<AIMode, string>> = {
  outline: "outline",
  summarize: "summary",
  citations: "citation",
  brainstorm: "brainstorm",
  explain: "explanation",
  grammar: "correction",
};

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  Lightbulb,
  List,
  Search,
  Pencil,
  FileText,
  GraduationCap,
  BookMarked,
  CircleAlert,
  Shuffle,
  Compass,
};

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

const GUIDING_PROMPT = "Give me three guiding questions so I can redraft this in my own words, without writing it for me.";
const COPILOT_NOTE = "Provided by your university. Ask anything about your research. The history is kept and visible to your institution; it will not write your thesis, and sentences you copy from it into your thesis are marked as AI-assisted.";

type PendingAction = "insert" | "notes" | "replace";
const ACTION_LABEL: Record<PendingAction, string> = { insert: "Insert, marked as AI", notes: "Keep as notes", replace: "Replace selection" };

/** Markdown answer -> plain text for comments. */
function toPlainText(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*\n?/g, ""))
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)([^*_]+)\1/g, "$2")
    .replace(/(\*|_)([^*_\n]+)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

const ACTION_BTN = "text-xs px-2.5 py-[5px] rounded-lg border border-gray-200 bg-white text-brand-700 font-medium hover:bg-brand-50 disabled:opacity-40 flex items-center gap-1";

export default function AssistantPanel({ thesisId, sessionId, selection, onInsert, onReplaceSelection, onConsentRequired, onRejectSuggestion, variant = "panel", initialMode, initialConversationId, className = "", onConversationsChanged, insertContext, onClearSelection, onAddComment, onKeepAsNotes }: AssistantPanelProps) {
  const [modes, setModes] = useState<ModeInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [institutionModels, setInstitutionModels] = useState<InstitutionModelInfo[]>([]);
  const [allowance, setAllowance] = useState<AllowanceInfo | null>(null);
  const [mode, setMode] = useState<AIMode>(initialMode || "chat");
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
  const [pending, setPending] = useState<{ id: string; action: PendingAction } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ providers: ProviderInfo[]; modes: ModeInfo[]; defaultProvider: string | null; institutionModels?: InstitutionModelInfo[]; allowance?: AllowanceInfo | null; policy?: { researchCopilot?: boolean } }>("/api/ai/providers")
      .then((d) => {
        setProviders(d.providers);
        // The copilot leads when the institution offers it.
        const ordered = [...d.modes.filter((m) => m.id === "copilot"), ...d.modes.filter((m) => m.id !== "copilot")];
        setModes(ordered);
        if (!initialMode && !initialConversationId && d.policy?.researchCopilot) setMode("copilot");
        setInstitutionModels(d.institutionModels || []);
        setAllowance(d.allowance || null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const d = await api<{ conversations: typeof conversations }>(`/api/ai/conversations${thesisId ? `?thesisId=${thesisId}` : ""}`);
      setConversations(d.conversations);
      onConversationsChanged?.();
    } catch {
      /* ignore */
    }
  }, [thesisId, onConversationsChanged]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialConversationId) return;
    api<{ conversation: { messages: { id: string; role: "user" | "assistant"; content: string; mode?: AIMode; provider?: string; model?: string; createdAt: string }[] } }>(`/api/ai/conversations/${initialConversationId}`)
      .then((d) => {
        setMessages(d.conversation.messages.map((m) => ({ ...m })));
        const first = d.conversation.messages.find((m) => m.mode)?.mode;
        if (first) setMode(first);
      })
      .catch(() => {});
  }, [initialConversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, pending]);

  // A new selection from the editor re-enables the "Working on" context after it was dismissed.
  useEffect(() => {
    setUseSelection(true);
  }, [selection]);

  const currentMode = useMemo(() => modes.find((m) => m.id === mode), [modes, mode]);
  const copilotMode = modes.find((m) => m.id === "copilot");
  const gridModes = (modes.length ? modes : [{ id: "chat", label: "Ask", icon: "MessageSquare", description: "Open conversation about your research", insertable: false } as ModeInfo]).filter((m) => m.id !== "copilot");
  const workingOn = !!selection && useSelection;
  const selectionWords = selection ? countWordsInText(selection) : 0;
  const connected = providers.filter((p) => p.connection && p.connection.status === "active");
  const activeProvider = providers.find((p) => p.id === providerChoice);
  const activeInstitution = institutionModels.find((m) => m.id === providerChoice);
  const readyInstitution = institutionModels.filter((m) => m.ready);
  const defaultInstitution = readyInstitution.find((m) => m.isDefault) || readyInstitution[0];
  const allowanceUsed = allowance && allowance.perStudentMonthly > 0 ? Math.min(100, Math.round((allowance.spentStudent / allowance.perStudentMonthly) * 100)) : null;

  // Provider chip: "Claude · your account" / "Claude Sonnet 5.5 · your university" / "Demo assistant".
  const shortLabel = (s: string) => s.split(" (")[0];
  const firstWord = (s: string) => s.split(/[\s/]/)[0];
  let chipText = "Demo assistant";
  let chipColor: string | null = null;
  if (providerChoice === "auto") {
    if (allowance?.institutionPays && defaultInstitution && allowance.exhausted === "none") {
      chipText = `${shortLabel(defaultInstitution.label)} · your university`;
      chipColor = defaultInstitution.color;
    } else if (connected[0]) {
      chipText = `${firstWord(connected[0].product)} · your account`;
      chipColor = connected[0].color;
    }
  } else if (activeInstitution) {
    chipText = `${shortLabel(activeInstitution.label)} · your university`;
    chipColor = activeInstitution.color;
  } else if (activeProvider) {
    const name = firstWord(activeProvider.product);
    chipText = activeProvider.connection?.status === "active" ? `${name} · your account` : activeProvider.platformKey ? `${name} · institution` : `${name} · demo`;
    chipColor = activeProvider.color;
  }

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setPending(null);
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
          selection: workingOn ? selection : undefined,
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
    setPending(null);
  };

  const openConversation = async (id: string) => {
    setHistoryOpen(false);
    try {
      const d = await api<{ conversation: { messages: ChatMsg[] } }>(`/api/ai/conversations/${id}`);
      setConversationId(id);
      setMessages(d.conversation.messages);
      setPending(null);
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

  const dismissSelection = () => {
    setUseSelection(false);
    onClearSelection?.();
  };

  const metaFor = (m: ChatMsg): InsertMeta => ({ provider: m.provider || "demo", model: m.model || "", mode: m.mode || mode, interactionId: m.interactionId, words: countWordsInText(m.content) });

  /** Runs the confirmed action from the cost card. Never called without it. */
  const confirmPending = () => {
    if (!pending) return;
    const m = messages.find((x) => x.id === pending.id);
    if (!m) return setPending(null);
    const html = markdownToHtml(m.content);
    const meta = metaFor(m);
    if (pending.action === "insert") onInsert?.(html, meta);
    else if (pending.action === "notes") onKeepAsNotes?.(html, meta);
    else onReplaceSelection?.(html, meta);
    setPending(null);
    setInserted(m.id);
    setTimeout(() => setInserted(null), 1500);
  };

  const isPage = variant === "page";
  const column = isPage ? "max-w-3xl w-full mx-auto" : "";
  const modeLabel = (id?: AIMode) => (id ? MODE_LABELS[id] || id : "Ask");
  const placeholderLabel = currentMode ? MODE_LABELS[currentMode.id] || currentMode.label : modeLabel(mode);

  const renderCostCard = (m: ChatMsg) => {
    if (!pending || pending.id !== m.id) return null;
    const n = countWordsInText(m.content);
    const noun = INSERT_NOUN[m.mode || mode] || "answer";
    const ctx = insertContext;
    const cur = ctx && ctx.wordCount > 0 ? Math.round((ctx.aiWords / ctx.wordCount) * 100) : 0;
    const next = ctx ? Math.round(((ctx.aiWords + n) / (ctx.wordCount + n || 1)) * 100) : 0;
    const over = !!ctx && next > ctx.limitPct;
    return (
      <div className="mt-2 border border-prov-ai-line bg-prov-ai-soft rounded-xl p-3" role="dialog" aria-label="Before you insert AI text">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-prov-ai" />
          <span className="text-xs font-semibold text-prov-ai-deep">Before you insert AI text</span>
        </div>
        <div className="text-[12.5px] leading-normal text-gray-700">
          {ctx ? (
            <>
              Inserting this {noun} adds <b>{n} AI-assisted {n === 1 ? "word" : "words"}</b>. Your AI share goes from <b>{cur}% to {next}%</b> of the {ctx.limitPct}% your institution allows. It is marked in the document and visible to your advisor.
            </>
          ) : (
            <>
              Inserting this {noun} adds <b>{n} AI-assisted {n === 1 ? "word" : "words"}</b>. It is marked as AI-assisted wherever it goes and counts toward your institution&apos;s AI limit.
            </>
          )}
          {ctx?.payer && <> Billed to {ctx.payer} (AI budget).</>}
          {over && ctx && <div className="mt-1.5 text-prov-ai-deep font-medium">This insertion would take you to {next}%, above the {ctx.limitPct}% limit.</div>}
        </div>
        <div className="flex gap-1.5 mt-2.5 text-xs">
          <button onClick={confirmPending} disabled={over} className="px-[11px] py-1.5 rounded-lg bg-prov-ai text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {ACTION_LABEL[pending.action]}
          </button>
          <button onClick={() => setPending(null)} className="px-[11px] py-1.5 rounded-lg border border-prov-ai-line text-prov-ai-deep font-medium hover:bg-white">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderActions = (m: ChatMsg) => {
    const mm = m.mode || mode;
    const guiding = mm === "critique" || mm === "gaps" || mm === "paraphrase_check" || mm === "copilot";
    const insertable = mm === "outline" || mm === "summarize" || mm === "citations" || mm === "brainstorm" || mm === "explain";
    const grammar = mm === "grammar";
    const canReplace = grammar && !!onReplaceSelection && !!selection;
    const canInsert = !!onInsert && (insertable || (grammar && !canReplace));
    const canNotes = !!onKeepAsNotes && insertable;
    const open = (action: PendingAction) => setPending((p) => (p && p.id === m.id && p.action === action ? null : { id: m.id, action }));
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {!m.blocked && guiding && (
          <button onClick={() => send(GUIDING_PROMPT)} disabled={loading} className={ACTION_BTN}>
            Guiding questions
          </button>
        )}
        {!m.blocked && (guiding || mm === "chat") && onAddComment && (
          <button onClick={() => onAddComment(toPlainText(m.content))} className={ACTION_BTN}>
            Add as comment
          </button>
        )}
        {!m.blocked && canInsert && (
          <button onClick={() => open("insert")} className={ACTION_BTN} title="Insert at the cursor, marked as AI-assisted">
            {inserted === m.id ? <Check className="w-3 h-3" /> : null} {ACTION_LABEL.insert}
          </button>
        )}
        {!m.blocked && canNotes && (
          <button onClick={() => open("notes")} className={ACTION_BTN} title="Add to your Research notes tab, marked as AI-assisted">
            {ACTION_LABEL.notes}
          </button>
        )}
        {!m.blocked && canReplace && (
          <button onClick={() => open("replace")} className={ACTION_BTN} title="Replace the selected passage, marked as AI-assisted">
            {inserted === m.id ? <Check className="w-3 h-3" /> : null} {ACTION_LABEL.replace}
          </button>
        )}
        <button onClick={() => copy(m)} className={`${ACTION_BTN} !text-gray-500 hover:!bg-gray-50`}>
          {copied === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied === m.id ? "Copied" : "Copy"}
        </button>
        {onRejectSuggestion && !m.blocked && (mm === "grammar" || mm === "outline") && (
          <button onClick={() => onRejectSuggestion({ provider: m.provider || "demo", mode: mm })} className="text-xs px-2 py-[5px] rounded-lg text-gray-400 hover:bg-gray-100">
            Dismiss
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full min-h-0 bg-white ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5 flex-shrink-0">
        <div className="w-[30px] h-[30px] bg-gradient-to-br from-brand-500 to-accent-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight">Thesisfic AI</div>
          <div className="text-xs text-gray-400 truncate">Thinks with you. Never writes your thesis.</div>
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={() => setProviderOpen((o) => !o)} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1.5 max-w-[190px]" aria-label="Choose AI provider" aria-expanded={providerOpen}>
            <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${chipColor ? "" : "bg-gray-400"}`} style={chipColor ? { background: chipColor } : undefined} />
            <span className="truncate">{chipText}</span>
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          </button>
          {providerOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white rounded-[10px] shadow-xl border border-gray-100 z-20 py-1 text-sm">
              <button onClick={() => { setProviderChoice("auto"); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${providerChoice === "auto" ? "text-brand-600 font-medium" : ""}`}>
                Auto {allowance?.institutionPays && readyInstitution.length ? "(university models first)" : "(your account first)"}
              </button>
              {allowance?.institutionPays && institutionModels.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">Provided by your university</div>
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
                  Connect your Claude / ChatGPT / Gemini account
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={() => setHistoryOpen((o) => !o)} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label="Conversation history" aria-expanded={historyOpen}>
            <History className="w-4 h-4" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 mt-1 w-72 bg-white rounded-[10px] shadow-xl border border-gray-100 z-20 max-h-80 overflow-y-auto text-sm">
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
                  <button onClick={() => deleteConversation(c.id)} className="p-1 text-gray-300 hover:text-red-500" aria-label="Delete conversation">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={newChat} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0" aria-label="New conversation">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Modes */}
      <div className={`px-4 pt-3 flex-shrink-0 ${column}`}>
        {copilotMode && (
          <button
            onClick={() => setMode("copilot")}
            aria-pressed={mode === "copilot"}
            className={`w-full mb-1.5 flex items-center gap-2.5 px-3 py-2 rounded-[10px] border text-left transition-colors ${mode === "copilot" ? "bg-accent-600 border-accent-600 text-white" : "bg-accent-50 border-accent-200 text-accent-800 hover:border-accent-400"}`}
          >
            <Compass className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold leading-tight">Research copilot</span>
              <span className={`block text-[11px] leading-tight truncate ${mode === "copilot" ? "text-white/80" : "text-accent-700"}`}>Provided by your university · history kept</span>
            </span>
          </button>
        )}
        <div className="grid grid-cols-5 gap-1.5">
          {gridModes.map((m) => {
            const Icon = ICONS[m.icon] || MessageSquare;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                title={m.description}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 px-0.5 pt-2 pb-1.5 rounded-[10px] border text-[11px] font-medium leading-[1.1] text-center transition-colors ${active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-brand-300"}`}
              >
                <Icon className="w-4 h-4" />
                <span>{MODE_LABELS[m.id] || m.label}</span>
              </button>
            );
          })}
        </div>
        {mode === "copilot" ? (
          <div className="mt-2 mx-0.5 text-xs text-accent-800 bg-accent-50 rounded-lg px-2.5 py-1.5">
            <strong>Research copilot</strong>, {COPILOT_NOTE.charAt(0).toLowerCase() + COPILOT_NOTE.slice(1)}
          </div>
        ) : (
          <div className="mt-2 mx-0.5 text-xs text-gray-500">{currentMode?.description || ""}</div>
        )}
      </div>

      {/* Working on */}
      {workingOn && (
        <div className={`px-4 flex-shrink-0 ${column}`}>
          <div className="mt-3 px-3 py-2.5 border border-gray-200 rounded-[10px] bg-gray-50 flex gap-2.5 items-start">
            <span className="w-[3px] self-stretch rounded-sm bg-brand-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-gray-400 mb-0.5">Working on · {selectionWords} {selectionWords === 1 ? "word" : "words"}</div>
              <div className="font-serif text-[13px] leading-[1.45] text-gray-700 line-clamp-2">{selection}</div>
            </div>
            <button onClick={dismissSelection} className="text-gray-400 hover:text-gray-600 p-0.5 -mr-1" aria-label="Stop working on this selection">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Conversation */}
      <div className={`flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3.5 min-h-0 ${column}`}>
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 flex flex-col gap-3 pt-1">
            <p>
              <strong className="text-gray-700">{placeholderLabel}</strong>
              {currentMode?.description ? ` — ${currentMode.description.charAt(0).toLowerCase()}${currentMode.description.slice(1)}.` : "."} {mode === "copilot" ? "Go as deep as you need; writing stays yours." : "It helps you think and revise; it never writes your thesis for you."}
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
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="self-end max-w-[85%] text-sm leading-normal px-3 py-[9px] rounded-[12px_12px_2px_12px] bg-brand-600 text-white whitespace-pre-wrap">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400 flex-wrap">
                <span>
                  {m.label || "Thesisfic AI"} · {modeLabel(m.mode)}
                </span>
                {!m.error && <span className="px-[7px] py-px rounded-full bg-brand-50 text-brand-700 font-semibold">logged</span>}
                {m.blocked && <span className="badge-danger !text-[10px] !py-0">blocked by policy</span>}
                {m.demo && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">demo</span>}
                {m.billedTo === "institution" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px] !py-0">paid by university</span>}
                {m.billedTo === "student" && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">your account</span>}
              </div>
              {m.notice && !m.error && <div className="mb-1 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">{m.notice}</div>}
              <div className={`text-sm leading-[1.55] px-3 py-2.5 rounded-[12px_12px_12px_2px] text-gray-900 ${m.blocked ? "bg-amber-50 border border-amber-100" : "bg-gray-100"}`}>
                <Markdown text={m.content || (m.streaming ? "…" : "")} />
                {m.error && <div className="mt-2 text-xs text-red-600">{m.error}</div>}
                {m.streaming && <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />}
              </div>
              {!m.streaming && m.content && renderActions(m)}
              {!m.streaming && m.content && renderCostCard(m)}
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className={`px-4 pt-3 pb-3.5 border-t border-gray-100 flex-shrink-0 ${column}`}>
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-[9px] border border-gray-200 focus-within:border-brand-400">
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
            aria-label="Message to Thesisfic AI"
            placeholder={`${placeholderLabel}… (Enter to send, Shift+Enter for a new line)`}
            className="flex-1 bg-transparent resize-none text-sm placeholder:text-gray-400 focus:outline-none max-h-[140px] leading-normal"
          />
          {loading ? (
            <button onClick={stop} className="w-7 h-7 rounded-lg bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0" aria-label="Stop">
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()} className="w-7 h-7 rounded-lg bg-brand-600 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-30" aria-label="Send">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
