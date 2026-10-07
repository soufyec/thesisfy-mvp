"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  BookOpen,
} from "lucide-react";
import Markdown, { markdownToHtml } from "../Markdown";
import { api, ApiError, countWordsInText, streamChat } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

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
  /** Demo-mode explanation sent as metadata (never part of the answer text). */
  demoNotice?: string;
  billedTo?: string;
  notice?: string;
  /** "Use my sources" was on for this answer; `groundedPassages` is how many library passages grounded it. */
  useSources?: boolean;
  groundedPassages?: number;
  createdAt: string;
}

/** Legacy demo footnote that older stored conversations still carry inside the answer; stripped before any insertion. */
const DEMO_NOTE_RE = /\n*_\((?:Demo mode|Modo demo|Mode démo)[^)]*\)_\s*$/;

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

/** English fallback labels, still imported by other screens. Inside the panel the labels are translated (`assistant.mode.<id>.short`). */
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

/** Number of quick suggestions per mode; the texts live in `assistant.mode.<id>.suggestion<N>`. */
const QUICK_COUNT: Record<AIMode, number> = { chat: 3, brainstorm: 3, outline: 3, critique: 3, grammar: 3, summarize: 3, explain: 3, citations: 3, gaps: 3, paraphrase_check: 3, copilot: 4 };

/** Renders `**bold**` segments of a translated string. */
function rich(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

type PendingAction = "insert" | "notes" | "replace";
const ACTION_KEY: Record<PendingAction, string> = { insert: "assistant.action.insert", notes: "assistant.action.notes", replace: "assistant.action.replace" };

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
  const t = useT();
  const fmt = useFormat();
  const [modes, setModes] = useState<ModeInfo[]>([]);
  /** The mode grid folds into a chip once a conversation is under way, so the messages get the space (phones above all). */
  const [modesOpen, setModesOpen] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [institutionModels, setInstitutionModels] = useState<InstitutionModelInfo[]>([]);
  const [allowance, setAllowance] = useState<AllowanceInfo | null>(null);
  const [mode, setMode] = useState<AIMode>(initialMode || "chat");
  const [providerChoice, setProviderChoice] = useState<string>("auto");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useSelection, setUseSelection] = useState(true);
  const [useSources, setUseSources] = useState(false);
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

  const copilotMode = modes.find((m) => m.id === "copilot");
  const gridModes = (modes.length ? modes : [{ id: "chat", label: "", icon: "MessageSquare", description: "", insertable: false } as ModeInfo]).filter((m) => m.id !== "copilot");
  const wordsLabel = (n: number) => (n === 1 ? t("common.word_one") : t("common.words", { n }));
  /** Relative time in the active language; falls back to a formatted date after 30 days. */
  const ago = (iso: string) => {
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return t("assistant.ago.now");
    if (mins < 60) return t("assistant.ago.minutes", { n: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t("assistant.ago.hours", { n: hours });
    const days = Math.round(hours / 24);
    if (days < 30) return t("assistant.ago.days", { n: days });
    return fmt.date(d);
  };
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
  let chipText = t("assistant.chip.demo");
  let chipColor: string | null = null;
  if (providerChoice === "auto") {
    if (allowance?.institutionPays && defaultInstitution && allowance.exhausted === "none") {
      chipText = t("assistant.chip.university", { name: shortLabel(defaultInstitution.label) });
      chipColor = defaultInstitution.color;
    } else if (connected[0]) {
      chipText = t("assistant.chip.account", { name: firstWord(connected[0].product) });
      chipColor = connected[0].color;
    }
  } else if (activeInstitution) {
    chipText = t("assistant.chip.university", { name: shortLabel(activeInstitution.label) });
    chipColor = activeInstitution.color;
  } else if (activeProvider) {
    const name = firstWord(activeProvider.product);
    chipText = activeProvider.connection?.status === "active" ? t("assistant.chip.account", { name }) : activeProvider.platformKey ? t("assistant.chip.institution", { name }) : t("assistant.chip.demoProvider", { name });
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
          useSources: useSources && !!thesisId ? true : undefined,
        },
        {
          onMeta: (meta) => {
            if (meta.conversationId) setConversationId(String(meta.conversationId));
            update({ provider: String(meta.provider), model: String(meta.model), label: String(meta.label), blocked: !!meta.blocked, demo: !!meta.demo, demoNotice: meta.demoNotice ? String(meta.demoNotice) : undefined, billedTo: meta.billedTo ? String(meta.billedTo) : undefined, notice: meta.notice ? String(meta.notice) : undefined, useSources: !!meta.useSources, groundedPassages: typeof meta.groundedPassages === "number" ? meta.groundedPassages : undefined });
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

  const metaFor = (m: ChatMsg): InsertMeta => ({ provider: m.provider || "demo", model: m.model || "", mode: m.mode || mode, interactionId: m.interactionId, words: countWordsInText(m.content.replace(DEMO_NOTE_RE, "")) });
  /** The cost card names who pays in the UI language; the editor passes the funding side as a plain token or legacy label. */
  const payerLabel = (payer?: string) => {
    if (!payer) return undefined;
    const p = payer.toLowerCase();
    if (p === "institution" || p === "university" || p === "your university") return t("assistant.cost.payer.university");
    if (p === "student" || p === "you" || p === "your account") return t("assistant.cost.payer.you");
    return payer;
  };

  /** Runs the confirmed action from the cost card. Never called without it. */
  const confirmPending = () => {
    if (!pending) return;
    const m = messages.find((x) => x.id === pending.id);
    if (!m) return setPending(null);
    const html = markdownToHtml(m.content.replace(DEMO_NOTE_RE, ""));
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
  const modeLabel = (id?: AIMode) => t(`assistant.mode.${id || "chat"}.short`);
  const modeDescription = t(`assistant.mode.${mode}.description`);
  const placeholderLabel = modeLabel(mode);

  const renderCostCard = (m: ChatMsg) => {
    if (!pending || pending.id !== m.id) return null;
    const n = countWordsInText(m.content.replace(DEMO_NOTE_RE, ""));
    const noun = t(`assistant.cost.noun.${INSERT_NOUN[m.mode || mode] || "answer"}`);
    const words = n === 1 ? t("assistant.cost.aiWords_one") : t("assistant.cost.aiWords", { n });
    const ctx = insertContext;
    const cur = ctx && ctx.wordCount > 0 ? Math.round((ctx.aiWords / ctx.wordCount) * 100) : 0;
    const next = ctx ? Math.round(((ctx.aiWords + n) / (ctx.wordCount + n || 1)) * 100) : 0;
    const over = !!ctx && next > ctx.limitPct;
    return (
      <div className="mt-2 border border-prov-ai-line bg-prov-ai-soft rounded-xl p-3" role="dialog" aria-label={t("assistant.cost.title")}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-prov-ai" />
          <span className="text-xs font-semibold text-prov-ai-deep">{t("assistant.cost.title")}</span>
        </div>
        <div className="text-[12.5px] leading-normal text-gray-700">
          {ctx ? rich(t("assistant.cost.withLimit", { noun, words, cur, next, limit: ctx.limitPct })) : rich(t("assistant.cost.noLimit", { noun, words }))}
          {ctx?.payer && <> {t("assistant.cost.billedTo", { payer: payerLabel(ctx.payer) })}</>}
          {over && ctx && <div className="mt-1.5 text-prov-ai-deep font-medium">{t("assistant.cost.over", { next, limit: ctx.limitPct })}</div>}
        </div>
        <div className="flex gap-1.5 mt-2.5 text-xs">
          <button onClick={confirmPending} disabled={over} className="px-[11px] py-1.5 rounded-lg bg-prov-ai text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {t(ACTION_KEY[pending.action])}
          </button>
          <button onClick={() => setPending(null)} className="px-[11px] py-1.5 rounded-lg border border-prov-ai-line text-prov-ai-deep font-medium hover:bg-white">
            {t("common.cancel")}
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
          <button onClick={() => send(t("assistant.guidingPrompt"))} disabled={loading} className={ACTION_BTN}>
            {t("assistant.action.guidingQuestions")}
          </button>
        )}
        {!m.blocked && (guiding || mm === "chat") && onAddComment && (
          <button onClick={() => onAddComment(toPlainText(m.content))} className={ACTION_BTN}>
            {t("assistant.action.addComment")}
          </button>
        )}
        {!m.blocked && canInsert && (
          <button onClick={() => open("insert")} className={ACTION_BTN} title={t("assistant.action.insertTitle")}>
            {inserted === m.id ? <Check className="w-3 h-3" /> : null} {t(ACTION_KEY.insert)}
          </button>
        )}
        {!m.blocked && canNotes && (
          <button onClick={() => open("notes")} className={ACTION_BTN} title={t("assistant.action.notesTitle")}>
            {t(ACTION_KEY.notes)}
          </button>
        )}
        {!m.blocked && canReplace && (
          <button onClick={() => open("replace")} className={ACTION_BTN} title={t("assistant.action.replaceTitle")}>
            {inserted === m.id ? <Check className="w-3 h-3" /> : null} {t(ACTION_KEY.replace)}
          </button>
        )}
        <button onClick={() => copy(m)} className={`${ACTION_BTN} !text-gray-500 hover:!bg-gray-50`}>
          {copied === m.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied === m.id ? t("common.copied") : t("common.copy")}
        </button>
        {onRejectSuggestion && !m.blocked && (mm === "grammar" || mm === "outline") && (
          <button onClick={() => onRejectSuggestion({ provider: m.provider || "demo", mode: mm })} className="text-xs px-2 py-[5px] rounded-lg text-gray-400 hover:bg-gray-100">
            {t("assistant.action.dismiss")}
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
          <div className="text-sm font-semibold leading-tight whitespace-nowrap">{t("glossary.assistant")}</div>
          <div className="text-xs text-gray-400 truncate">{t("glossary.tagline")}</div>
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={() => setProviderOpen((o) => !o)} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1.5 max-w-[150px]" aria-label={t("assistant.provider.aria")} aria-expanded={providerOpen}>
            <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${chipColor ? "" : "bg-gray-400"}`} style={chipColor ? { background: chipColor } : undefined} />
            <span className="truncate">{chipText}</span>
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          </button>
          {providerOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white rounded-[10px] shadow-xl border border-gray-100 z-20 py-1 text-sm">
              <button onClick={() => { setProviderChoice("auto"); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${providerChoice === "auto" ? "text-brand-600 font-medium" : ""}`}>
                {allowance?.institutionPays && readyInstitution.length ? t("assistant.provider.autoUniversity") : t("assistant.provider.autoAccount")}
              </button>
              {allowance?.institutionPays && institutionModels.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">{t("glossary.providedByUniversity")}</div>
                  {allowanceUsed !== null && <div className="px-3 pb-1 text-[11px] text-gray-500">{t("assistant.provider.used", { spent: fmt.number(allowance.spentStudent, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), limit: fmt.number(allowance.perStudentMonthly), currency: allowance.currency })}</div>}
                  {allowanceUsed !== null && (
                    <div className="mx-3 mb-1 h-1 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${allowanceUsed >= 100 ? "bg-red-500" : allowanceUsed >= 80 ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${allowanceUsed}%` }} /></div>
                  )}
                  {institutionModels.map((m) => (
                    <button key={m.id} disabled={!m.ready || allowance.exhausted !== "none"} onClick={() => { setProviderChoice(m.id); setProviderOpen(false); }} title={`${m.backendName} · ${m.region}`} className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40 ${providerChoice === m.id ? "text-brand-600 font-medium" : ""}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span className="flex-1 truncate">{m.label}</span>
                      <span className="text-[10px] text-gray-400">{!m.ready ? t("assistant.provider.notConfigured") : allowance.exhausted !== "none" ? t("assistant.provider.allowanceUsed") : m.region}</span>
                    </button>
                  ))}
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">{t("assistant.provider.ownAccounts")}</div>
                </>
              )}
              {providers.map((p) => (
                <button key={p.id} disabled={!p.allowedByPolicy} onClick={() => { setProviderChoice(p.id); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40 ${providerChoice === p.id ? "text-brand-600 font-medium" : ""}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="flex-1">{p.product}</span>
                  <span className="text-[10px] text-gray-400">{p.connection ? t("assistant.provider.yourAccount") : p.platformKey ? t("assistant.provider.institution") : !p.allowedByPolicy ? t("assistant.provider.notAllowed") : t("assistant.provider.demo")}</span>
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <a href="/dashboard/connections" className="block px-3 py-2 text-xs text-brand-600 hover:bg-gray-50">
                  {t("assistant.provider.connect")}
                </a>
              </div>
            </div>
          )}
        </div>
        <div className="relative flex-shrink-0">
          <button onClick={() => setHistoryOpen((o) => !o)} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label={t("assistant.history.aria")} aria-expanded={historyOpen}>
            <History className="w-4 h-4" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 mt-1 w-72 bg-white rounded-[10px] shadow-xl border border-gray-100 z-20 max-h-80 overflow-y-auto text-sm">
              <button onClick={newChat} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-brand-600 font-medium border-b border-gray-100">
                <Plus className="w-4 h-4" /> {t("assistant.history.new")}
              </button>
              {conversations.length === 0 && <div className="px-3 py-4 text-xs text-gray-400">{t("assistant.history.empty")}</div>}
              {conversations.map((c) => (
                <div key={c.id} className={`flex items-center gap-1 px-2 py-1.5 hover:bg-gray-50 ${c.id === conversationId ? "bg-brand-50" : ""}`}>
                  <button onClick={() => openConversation(c.id)} className="flex-1 text-left min-w-0">
                    <div className="truncate text-xs font-medium">{c.title}</div>
                    <div className="text-[10px] text-gray-400">{t("assistant.history.meta", { n: c.messageCount, ago: ago(c.updatedAt) })}</div>
                  </button>
                  <button onClick={() => deleteConversation(c.id)} className="p-1 text-gray-300 hover:text-red-500" aria-label={t("assistant.history.delete")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={newChat} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0" aria-label={t("assistant.history.new")}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Modes */}
      {(() => {
        const open = modesOpen === null ? messages.length === 0 : modesOpen;
        const ActiveIcon = ICONS[(modes.find((m) => m.id === mode) || gridModes[0])?.icon || "MessageSquare"] || MessageSquare;
        if (!open) {
          return (
            <div className={`px-4 pt-2.5 flex-shrink-0 ${column}`}>
              <button
                onClick={() => setModesOpen(true)}
                aria-expanded={false}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-[10px] border text-left text-xs ${mode === "copilot" ? "bg-accent-50 border-accent-200 text-accent-800" : "bg-gray-50 border-gray-200 text-gray-700"}`}
              >
                {mode === "copilot" ? <Compass className="w-4 h-4 flex-shrink-0" /> : <ActiveIcon className="w-4 h-4 flex-shrink-0" />}
                <span className="font-semibold truncate">{mode === "copilot" ? t("glossary.copilot") : t(`assistant.mode.${mode}.label`)}</span>
                <span className="ml-auto text-[11px] text-gray-500 flex-shrink-0">{t("assistant.modes.change")}</span>
              </button>
            </div>
          );
        }
        return (
      <div className={`px-4 pt-3 flex-shrink-0 ${column}`}>
        {copilotMode && (
          <button
            onClick={() => { setMode("copilot"); if (messages.length) setModesOpen(false); }}
            aria-pressed={mode === "copilot"}
            className={`w-full mb-1.5 flex items-center gap-2.5 px-3 py-2 rounded-[10px] border text-left transition-colors ${mode === "copilot" ? "bg-accent-600 border-accent-600 text-white" : "bg-accent-50 border-accent-200 text-accent-800 hover:border-accent-400"}`}
          >
            <Compass className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold leading-tight">{t("glossary.copilot")}</span>
              <span className={`block text-[11px] leading-tight truncate ${mode === "copilot" ? "text-white/80" : "text-accent-700"}`}>{t("assistant.copilot.tileSub")}</span>
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
                onClick={() => { setMode(m.id); if (messages.length) setModesOpen(false); }}
                title={t(`assistant.mode.${m.id}.description`)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 px-0.5 pt-2 pb-1.5 rounded-[10px] border text-[11px] font-medium leading-[1.1] text-center transition-colors ${active ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-brand-300"}`}
              >
                <Icon className="w-4 h-4" />
                <span>{t(`assistant.mode.${m.id}.short`)}</span>
              </button>
            );
          })}
        </div>
        {mode === "copilot" ? (
          <div className="mt-2 mx-0.5 text-xs text-accent-800 bg-accent-50 rounded-lg px-2.5 py-1.5">
            <strong>{t("glossary.copilot")}</strong>{t("assistant.copilot.noteRest")}
          </div>
        ) : (
          <div className="mt-2 mx-0.5 text-xs text-gray-500">{modeDescription}</div>
        )}
      </div>
        );
      })()}

      {/* Working on */}
      {workingOn && (
        <div className={`px-4 flex-shrink-0 ${column}`}>
          <div className="mt-3 px-3 py-2.5 border border-gray-200 rounded-[10px] bg-gray-50 flex gap-2.5 items-start">
            <span className="w-[3px] self-stretch rounded-sm bg-brand-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-gray-400 mb-0.5">{t("assistant.workingOn", { words: wordsLabel(selectionWords) })}</div>
              <div className="font-serif text-[13px] leading-[1.45] text-gray-700 line-clamp-2">{selection}</div>
            </div>
            <button onClick={dismissSelection} className="text-gray-400 hover:text-gray-600 p-0.5 -mr-1" aria-label={t("assistant.workingOn.stop")}>
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
              {` — ${modeDescription.charAt(0).toLowerCase()}${modeDescription.slice(1)}.`} {mode === "copilot" ? t("assistant.empty.copilot") : t("assistant.empty.other")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: QUICK_COUNT[mode] }, (_, i) => t(`assistant.mode.${mode}.suggestion${i + 1}`)).map((q) => (
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
                  {m.label || t("glossary.assistant")} · {modeLabel(m.mode)}
                </span>
                {!m.error && <span className="px-[7px] py-px rounded-full bg-brand-50 text-brand-700 font-semibold">{t("assistant.msg.logged")}</span>}
                {m.blocked && <span className="badge-danger !text-[10px] !py-0">{t("assistant.msg.blocked")}</span>}
                {m.demo && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">{t("assistant.msg.demo")}</span>}
                {m.billedTo === "institution" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px] !py-0">{t("assistant.msg.paidByUniversity")}</span>}
                {m.billedTo === "student" && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">{t("assistant.msg.yourAccount")}</span>}
                {m.useSources && !m.error && (
                  <span className={`badge !text-[10px] !py-0 inline-flex items-center gap-1 ${m.groundedPassages ? "bg-accent-50 text-accent-800" : "bg-gray-100 text-gray-500"}`}>
                    <BookOpen className="w-3 h-3" aria-hidden />
                    {m.groundedPassages ? t(m.groundedPassages === 1 ? "assistant.msg.passages_one" : "assistant.msg.passages", { n: m.groundedPassages }) : t("assistant.msg.noPassages")}
                  </span>
                )}
              </div>
              {m.notice && !m.error && <div className="mb-1 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">{m.notice}</div>}
              {m.demo && !m.error && !m.streaming && <div className="mb-1 text-[11px] text-gray-500">{t("assistant.msg.demoNotice")}</div>}
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
        {thesisId && (
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setUseSources((v) => !v)} aria-pressed={useSources} className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg border ${useSources ? "bg-accent-50 border-accent-200 text-accent-800" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`} title={t("assistant.sources.title")}>
              <BookOpen className="w-3.5 h-3.5" />{useSources ? t("assistant.sources.on") : t("assistant.sources.button")}
            </button>
            {useSources && <span className="text-[11px] text-gray-400">{t("assistant.sources.note")}</span>}
          </div>
        )}
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
            aria-label={t("assistant.composer.aria")}
            placeholder={t("assistant.composer.placeholder", { mode: placeholderLabel })}
            className="flex-1 bg-transparent resize-none text-sm placeholder:text-gray-400 focus:outline-none max-h-[140px] leading-normal"
          />
          {loading ? (
            <button onClick={stop} className="w-7 h-7 rounded-lg bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0" aria-label={t("assistant.composer.stop")}>
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()} className="w-7 h-7 rounded-lg bg-brand-600 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-30" aria-label={t("assistant.composer.send")}>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
