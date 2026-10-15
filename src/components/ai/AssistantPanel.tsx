"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoSpinner } from "@/components/Logo";
import {
  ArrowUp,
  BookMarked,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Compass,
  Copy,
  FileSpreadsheet,
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
import type { Artifact, Dataset, DatasetCell, DatasetColumn } from "@/lib/db";
import type { LibraryResponse, LibrarySourceView } from "@/components/editor/types";
import { artifactBlockState, extractArtifactBlocks, stripPartialArtifactBlocks } from "@/lib/data/blocks";
import { suggestions } from "@/lib/data/analysis";
import { libraryCall } from "@/components/library/libraryApi";
import { checkUpload, isPrimary, isSheetName, readAsSummary, UPLOAD_ACCEPT, uploadErrorText } from "@/components/library/primary";
import ArtifactCard, { ArtifactErrorCard, ArtifactSkeleton } from "./ArtifactCard";
import ArtifactCostCard from "./ArtifactCostCard";
import AttachMenu from "./AttachMenu";
import AttachmentChips, { attachedName, type AttachedSource } from "./AttachmentChips";
import GroundedNote, { groundedFilesOf, type GroundedFile } from "./GroundedNote";
import PrivacyNotice from "./PrivacyNotice";
import { artifactInsertWords, type ArtifactErrorInfo } from "./artifactText";

export type AIMode = "chat" | "brainstorm" | "outline" | "critique" | "grammar" | "summarize" | "explain" | "citations" | "gaps" | "paraphrase_check" | "copilot";

interface ModeInfo {
  id: AIMode;
  label: string;
  description: string;
  /** lucide-react icon name (see `MODES` in `src/lib/ai/prompts.ts`). */
  icon: string;
  insertable: boolean;
  /** Research copilot: its tables, charts, tests, diagrams and equations can be inserted (marked as AI), its text cannot. */
  artifactsInsertable?: boolean;
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
  usage?: {
    requests: number;
    costPerRequest: number;
    remaining: number | null;
    remainingRequests: number | null;
    usedPercent: number | null;
    institutionPercent: number | null;
    resetsAt: string;
    daysLeft: number;
    projectedPercent: number | null;
    runsOutAt: string | null;
  };
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
  /** Tables, charts, tests, diagrams and equations Thesisfic computed or validated for this answer (docs/papers.md §4.5). */
  artifacts?: Artifact[];
  /** Requested artifacts that could not be computed ("Thesisfic could not compute this: …"). */
  artifactErrors?: ArtifactErrorInfo[];
  /** Attached documents this answer read: "Used {n} passages from {file}". */
  groundedFiles?: GroundedFile[];
  /** User turn: the sources attached to it. */
  attachmentIds?: string[];
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

/** What the editor needs to insert a copilot artifact: the text-insertion meta plus the artifact's id and kind (§4.6). */
export type ArtifactInsertMeta = InsertMeta & { artifact: { id: string; kind: Artifact["kind"] } };

/**
 * Inserts a copilot artifact into the paper (the editor wires it to its artifact command, docs/papers.md §4.6): a table
 * or a test result as a table marked AI, a chart or a diagram as an AI-assisted figure, an equation as an AI equation
 * (`artifact.kind === "equation"`; a regression's fitted equation is passed with that kind and its `equation`).
 * `asNotes` sends it to the Research notes tab. Called only after the cost card was confirmed, and always with
 * `meta.interactionId`: the editor must refuse a call without it.
 */
export type InsertArtifactHandler = (artifact: Artifact, meta: ArtifactInsertMeta, opts: { asNotes?: boolean }) => void;

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
  /**
   * Final submission numbers for the cost card shown before any AI insertion (words, AI words, policy limit).
   * `onFinalSubmission: false` when the active tab is another one: artifacts inserted there get the notes wording.
   * `payer` is accepted for compatibility and never shown.
   */
  insertContext?: { wordCount: number; aiWords: number; limitPct: number; payer?: string; onFinalSubmission?: boolean; notesTitle?: string };
  /** Inserts a copilot artifact (table, chart, test, diagram, equation) after its cost card. Omitted = not insertable here. */
  onInsertArtifact?: InsertArtifactHandler;
  /**
   * Offers the paperclip in the Research copilot (default true). The panel also checks that the user is the paper's
   * student (the server ignores attachments from anyone else).
   */
  attachments?: boolean;
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

/** Rows read from a sheet to compute the data chips (`suggestions()` validates specs against the data). */
const CHIP_ROWS = 2000;
const PRIVACY_SEEN_KEY = "thesisfic.attachPrivacy";

function privacySeen(kind: "sheet" | "document", memory: Set<string>): boolean {
  if (memory.has(kind)) return true;
  try {
    return (window.sessionStorage.getItem(PRIVACY_SEEN_KEY) || "").split(",").indexOf(kind) !== -1;
  } catch {
    return false;
  }
}

function markPrivacySeen(kind: "sheet" | "document", memory: Set<string>) {
  memory.add(kind);
  try {
    const seen = new Set((window.sessionStorage.getItem(PRIVACY_SEEN_KEY) || "").split(",").filter(Boolean));
    seen.add(kind);
    window.sessionStorage.setItem(PRIVACY_SEEN_KEY, Array.from(seen).join(","));
  } catch {
    /* the in-memory set keeps it for this panel */
  }
}

/** The dataset of an attached sheet, rebuilt from the data route (columns with their statistics and up to 2,000 rows). */
async function loadChipDataset(thesisId: string, source: AttachedSource): Promise<Pick<Dataset, "sheets"> | null> {
  const sheets = source.dataset?.sheets || [];
  const out: Dataset["sheets"] = [];
  for (let i = 0; i < Math.min(sheets.length || 1, 5); i++) {
    let offset = 0;
    let columns: DatasetColumn[] = [];
    let rowCount = 0;
    let headerRow = 0;
    let truncated = false;
    let name = sheets[i]?.name || "";
    const data: DatasetCell[][] = [];
    do {
      const page = await api<{ sheet: { name: string; columns: DatasetColumn[]; rowCount: number; headerRow: number; truncated: boolean }; rows: DatasetCell[][]; total: number }>(`/api/theses/${encodeURIComponent(thesisId)}/sources/${encodeURIComponent(source.id)}/data?sheet=${i}&offset=${offset}&limit=500`);
      columns = page.sheet.columns;
      rowCount = page.sheet.rowCount;
      headerRow = page.sheet.headerRow;
      truncated = page.sheet.truncated;
      name = page.sheet.name;
      for (let c = 0; c < columns.length; c++) data[c] = data[c] || [];
      for (const row of page.rows) for (let c = 0; c < columns.length; c++) data[c].push(row[c] === undefined ? null : row[c]);
      offset += page.rows.length;
      if (!page.rows.length || offset >= page.total) break;
    } while (offset < CHIP_ROWS);
    out.push({ name, columns, data, rowCount: Math.min(rowCount, offset), headerRow, truncated });
  }
  return out.length ? { sheets: out } : null;
}

export default function AssistantPanel({ thesisId, sessionId, selection, onInsert, onReplaceSelection, onConsentRequired, onRejectSuggestion, variant = "panel", initialMode, initialConversationId, className = "", onConversationsChanged, insertContext, onClearSelection, onAddComment, onKeepAsNotes, onInsertArtifact, attachments: attachmentsAllowed = true }: AssistantPanelProps) {
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
  const [conversations, setConversations] = useState<{ id: string; title: string; updatedAt: string; messageCount: number; mode?: AIMode }[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const headerMenusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!providerOpen && !historyOpen) return;
    const close = () => {
      setProviderOpen(false);
      setHistoryOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (headerMenusRef.current && !headerMenusRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [providerOpen, historyOpen]);
  const [copied, setCopied] = useState<string | null>(null);
  const [inserted, setInserted] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; action: PendingAction } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ----- Attachments (Research copilot, docs/papers.md §4.5) -----
  /** Primary sources attached to this conversation; each send carries their ids. */
  const [attached, setAttached] = useState<AttachedSource[]>([]);
  /** The paper's primary sources ("From this paper"); null until first needed. */
  const [paperSources, setPaperSources] = useState<AttachedSource[] | null>(null);
  /** The student's library: tells whether this is their own paper (staff get an empty one) and lists "From your library". */
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [attachLoading, setAttachLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [readAsLine, setReadAsLine] = useState<string | null>(null);
  const [attachError, setAttachError] = useState("");
  /** File waiting for the privacy card's "Attach" (first file of its kind in this browser session). */
  const [privacyFor, setPrivacyFor] = useState<File | null>(null);
  const privacyMemory = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Datasets of attached sheets, for the data chips. */
  const [datasets, setDatasets] = useState<Record<string, Pick<Dataset, "sheets">>>({});
  const loadingDatasets = useRef(new Set<string>());
  // ----- Artifact insertion -----
  const [artifactPending, setArtifactPending] = useState<{ msgId: string; artifactId: string; action: "insert" | "notes" | "equation" } | null>(null);
  const [artifactDone, setArtifactDone] = useState<{ artifactId: string; action: "insert" | "notes" | "equation" } | null>(null);
  /** Restores a reopened conversation's attachments (set below, used by the initial-conversation effect). */
  const restoreRef = useRef<((msgs: ChatMsg[]) => void) | null>(null);

  useEffect(() => {
    api<{ providers: ProviderInfo[]; modes: ModeInfo[]; defaultProvider: string | null; institutionModels?: InstitutionModelInfo[]; allowance?: AllowanceInfo | null; policy?: { researchCopilot?: boolean } }>("/api/ai/providers")
      .then((d) => {
        setProviders(d.providers);
        // The copilot leads when the institution offers it.
        const ordered = [...d.modes.filter((m) => m.id === "copilot"), ...d.modes.filter((m) => m.id !== "copilot")];
        setModes(ordered);
        if (!initialMode && !initialConversationId && d.policy?.researchCopilot) setMode("copilot");
        setInstitutionModels(d.institutionModels || []);
        const ready = (d.institutionModels || []).filter((m) => m.ready);
        const preset = ready.find((m) => m.isDefault) || ready[0];
        if (preset && d.allowance?.institutionPays) setProviderChoice((c) => (c === "auto" ? preset.id : c));
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
    api<{ conversation: { messages: (Omit<ChatMsg, "mode"> & { mode?: AIMode })[] } }>(`/api/ai/conversations/${initialConversationId}`)
      .then((d) => {
        const msgs: ChatMsg[] = d.conversation.messages.map((m) => ({ ...m }));
        setMessages(msgs);
        const first = d.conversation.messages.find((m) => m.mode)?.mode;
        if (first) setMode(first);
        restoreRef.current?.(msgs);
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
  let chipText = t("assistant.chip.none");
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
    chipText = activeProvider.connection?.status === "active" ? t("assistant.chip.account", { name }) : activeProvider.platformKey ? t("assistant.chip.institution", { name }) : t("assistant.chip.none");
    chipColor = activeProvider.color;
  }

  // ----- Attachments -----
  const num = useCallback((n: number) => fmt.number(n), [fmt]);
  const copilotOn = mode === "copilot" && attachmentsAllowed;
  const ownPaper = thesisId && library ? library.theses.find((x) => x.id === thesisId) : undefined;
  /** The clip shows for the paper's student, and disabled (with a reason) when no paper is chosen. */
  const showClip = copilotOn && (!thesisId || !!ownPaper);

  useEffect(() => {
    if (!copilotOn || !thesisId || library) return;
    let alive = true;
    libraryCall<LibraryResponse>("/api/library")
      .then((d) => alive && setLibrary(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [copilotOn, thesisId, library]);

  const loadPaperSources = useCallback(async (): Promise<AttachedSource[]> => {
    if (!thesisId) return [];
    try {
      const d = await api<{ sources: (AttachedSource & { role?: string })[] }>(`/api/theses/${encodeURIComponent(thesisId)}/sources`);
      const list = (d.sources || []).filter((x) => isPrimary(x));
      setPaperSources(list);
      return list;
    } catch {
      setPaperSources((p) => p || []);
      return [];
    }
  }, [thesisId]);

  const loadDataset = useCallback(
    (s: AttachedSource) => {
      if (!thesisId || s.kind !== "sheet" || loadingDatasets.current.has(s.id)) return;
      loadingDatasets.current.add(s.id);
      loadChipDataset(thesisId, s)
        .then((d) => d && setDatasets((m) => ({ ...m, [s.id]: d })))
        .catch(() => loadingDatasets.current.delete(s.id));
    },
    [thesisId],
  );

  const addAttachment = useCallback(
    (s: AttachedSource) => {
      setAttached((list) => (list.some((x) => x.id === s.id) ? list : [...list, s].slice(0, 20)));
      if (s.kind === "sheet") {
        loadDataset(s);
      }
    },
    [loadDataset],
  );

  /** Re-attaches the files of the conversation's last attached message when a conversation is reopened. */
  const restoreAttachments = useCallback(
    async (msgs: ChatMsg[]) => {
      const last = [...msgs].reverse().find((m) => m.role === "user" && m.attachmentIds && m.attachmentIds.length);
      if (!last || !last.attachmentIds || !thesisId) return setAttached([]);
      const ids = last.attachmentIds;
      let pool = paperSources;
      if (!pool) pool = await loadPaperSources();
      // Literature attached through older flows still resolves through the paper's whole list.
      if (ids.some((id) => !pool!.some((x) => x.id === id))) {
        try {
          const d = await api<{ sources: AttachedSource[] }>(`/api/theses/${encodeURIComponent(thesisId)}/sources`);
          pool = d.sources || pool;
        } catch {
          /* keep what we have */
        }
      }
      const found = ids.map((id) => pool!.find((x) => x.id === id)).filter((x): x is AttachedSource => !!x);
      setAttached(found);
      found.forEach((x) => x.kind === "sheet" && loadDataset(x));
    },
    [thesisId, paperSources, loadPaperSources, loadDataset],
  );
  restoreRef.current = (msgs) => {
    restoreAttachments(msgs);
  };

  const openAttachMenu = async () => {
    setAttachError("");
    setAttachLoading(true);
    await Promise.all([loadPaperSources(), libraryCall<LibraryResponse>("/api/library").then(setLibrary).catch(() => {})]);
    setAttachLoading(false);
  };

  const uploadFile = async (f: File) => {
    if (!thesisId) return;
    const kind = isSheetName(f.name) ? "sheet" : "document";
    markPrivacySeen(kind, privacyMemory.current);
    setPrivacyFor(null);
    setAttachError("");
    setReadAsLine(null);
    setUploading(f.name);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("role", "primary");
      const r = await api<{ source: AttachedSource; existing?: boolean }>(`/api/theses/${encodeURIComponent(thesisId)}/sources`, { method: "POST", body: form });
      addAttachment(r.source);
      setPaperSources((list) => (list ? [r.source, ...list.filter((x) => x.id !== r.source.id)] : list));
      setReadAsLine(readAsSummary(r.source, t, num));
    } catch (e) {
      setAttachError(uploadErrorText(e, t));
    } finally {
      setUploading(null);
    }
  };

  const pickFile = (f: File | null | undefined) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!f) return;
    setAttachError("");
    const refused = checkUpload(f, t);
    if (refused) return setAttachError(refused);
    if (!privacySeen(isSheetName(f.name) ? "sheet" : "document", privacyMemory.current)) return setPrivacyFor(f);
    uploadFile(f);
  };

  const pickExisting = async (s: AttachedSource, fromLibrary: boolean) => {
    setAttachError("");
    setReadAsLine(null);
    if (!fromLibrary || !thesisId) return addAttachment(s);
    const view = s as AttachedSource & Partial<LibrarySourceView>;
    try {
      const r = await libraryCall<{ source: LibrarySourceView }>(`/api/library/sources/${encodeURIComponent(s.id)}`, { method: "PATCH", json: { thesisIds: Array.from(new Set([...(view.thesisIds || []), thesisId])) } });
      setLibrary((l) => (l ? { ...l, sources: l.sources.map((x) => (x.id === r.source.id ? r.source : x)) } : l));
      setPaperSources((list) => (list ? [r.source, ...list.filter((x) => x.id !== r.source.id)] : list));
      addAttachment(r.source);
    } catch (e) {
      setAttachError((e as Error).message || t("assistant.attach.linkFailed"));
    }
  };

  const paperItems = (paperSources || []).filter((x) => !attached.some((a) => a.id === x.id));
  const libraryItems = thesisId && library ? library.sources.filter((x) => isPrimary(x) && x.thesisIds.indexOf(thesisId) === -1 && !attached.some((a) => a.id === x.id)) : [];
  const chipSheet = attached.find((a) => a.kind === "sheet" && datasets[a.id]);
  const dataChips = useMemo(() => (copilotOn && chipSheet ? suggestions(datasets[chipSheet.id], t).slice(0, 4) : []), [copilotOn, chipSheet, datasets, t]);
  /** Under a conversation the chips stay while a sheet is attached, without those already asked. */
  const laterChips = dataChips.filter((c) => !messages.some((m) => m.role === "user" && m.content.trim() === c.prompt));
  const computingFile = attached.find((a) => a.kind === "sheet");

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setPending(null);
    setArtifactPending(null);
    setReadAsLine(null);
    const sourceIds = copilotOn && thesisId && attached.length ? attached.map((a) => a.id) : undefined;
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: "user", content, mode, createdAt: new Date().toISOString(), ...(sourceIds ? { attachmentIds: sourceIds } : {}) };
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
          provider: providerChoice === "auto" ? null : providerChoice.startsWith("platform:") ? providerChoice.slice(9) : providerChoice,
          selection: workingOn ? selection : undefined,
          useSources: useSources && !!thesisId ? true : undefined,
          sourceIds,
        },
        {
          onMeta: (meta) => {
            if (meta.conversationId) setConversationId(String(meta.conversationId));
            update({ provider: String(meta.provider), model: String(meta.model), label: String(meta.label), blocked: !!meta.blocked, demo: !!meta.demo, demoNotice: meta.demoNotice ? String(meta.demoNotice) : undefined, billedTo: meta.billedTo ? String(meta.billedTo) : undefined, notice: meta.notice ? String(meta.notice) : undefined, useSources: !!meta.useSources, groundedPassages: typeof meta.groundedPassages === "number" ? meta.groundedPassages : undefined, groundedFiles: groundedFilesOf(meta) });
            if (meta.billedTo === "institution") setAllowance((a) => (a ? { ...a } : a));
          },
          onDelta: (t) => setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: m.content + t } : m))),
          onArtifact: (a) => setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, artifacts: [...(m.artifacts || []), a].slice(0, 8) } : m))),
          onArtifactError: (e) => setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, artifactErrors: [...(m.artifactErrors || []), e as ArtifactErrorInfo].slice(0, 8) } : m))),
          onDone: (d) => {
            // The streamed text carried the artifact blocks; the stored answer (and what Copy takes) has none.
            setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, streaming: false, interactionId: d.interactionId, content: extractArtifactBlocks(m.content).text } : m)));
            if (allowance) api<{ allowance?: AllowanceInfo | null }>("/api/ai/providers").then((x) => setAllowance(x.allowance || null)).catch(() => {});
          },
          onError: (e) => update({ streaming: false, error: providerErrorText(e) }),
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
    setArtifactPending(null);
    setAttached([]);
    setReadAsLine(null);
    setAttachError("");
    setPrivacyFor(null);
  };

  /** Each assistant function keeps its own history: changing mode mid-conversation starts a fresh one. */
  const chooseMode = (id: AIMode) => {
    if (id === mode) return;
    setMode(id);
    if (messages.length || conversationId) newChat();
  };
  const modeConversations = conversations.filter((c) => (c.mode || "chat") === mode);

  const openConversation = async (id: string) => {
    setHistoryOpen(false);
    try {
      const d = await api<{ conversation: { messages: ChatMsg[] } }>(`/api/ai/conversations/${id}`);
      setConversationId(id);
      setMessages(d.conversation.messages);
      const first = d.conversation.messages[0]?.mode;
      if (first && first !== mode) setMode(first);
      setPending(null);
      setArtifactPending(null);
      setReadAsLine(null);
      restoreAttachments(d.conversation.messages);
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
    // Without the artifact blocks: the server fingerprints the text without them, so a copied sentence is recognised.
    await navigator.clipboard.writeText(extractArtifactBlocks(m.content).text).catch(() => {});
    setCopied(m.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const dismissSelection = () => {
    setUseSelection(false);
    onClearSelection?.();
  };

  const metaFor = (m: ChatMsg): InsertMeta => ({ provider: m.provider || "demo", model: m.model || "", mode: m.mode || mode, interactionId: m.interactionId, words: countWordsInText(m.content.replace(DEMO_NOTE_RE, "")) });

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

  /** The mode that produced a message lets its artifacts be inserted (Research copilot: `artifactsInsertable`). */
  const artifactsInsertableFor = (m: ChatMsg) => !!onInsertArtifact && !!modes.find((x) => x.id === (m.mode || mode))?.artifactsInsertable;

  const toggleArtifactAction = (msgId: string, artifactId: string, action: "insert" | "notes" | "equation") =>
    setArtifactPending((p) => (p && p.artifactId === artifactId && p.action === action ? null : { msgId, artifactId, action }));

  /** Runs the confirmed artifact insertion from its cost card. Never called without it, never without an interaction id. */
  const confirmArtifact = () => {
    if (!artifactPending || !onInsertArtifact) return;
    const m = messages.find((x) => x.id === artifactPending.msgId);
    const a = m?.artifacts?.find((x) => x.id === artifactPending.artifactId);
    const interactionId = a?.interactionId || m?.interactionId;
    if (!m || !a || !interactionId) return setArtifactPending(null);
    const asEquation = artifactPending.action === "equation";
    const target: Artifact = asEquation ? { ...a, kind: "equation", interactionId } : { ...a, interactionId };
    const meta: ArtifactInsertMeta = {
      provider: m.provider || "demo",
      model: m.model || "",
      mode: m.mode || mode,
      interactionId,
      words: artifactInsertWords(a, asEquation),
      artifact: { id: a.id, kind: target.kind },
    };
    onInsertArtifact(target, meta, { asNotes: artifactPending.action === "notes" });
    setArtifactDone({ artifactId: a.id, action: artifactPending.action });
    setArtifactPending(null);
    setTimeout(() => setArtifactDone(null), 1500);
  };

  const renderArtifacts = (m: ChatMsg) => {
    const insertable = artifactsInsertableFor(m);
    const ctx = insertContext ? { wordCount: insertContext.wordCount, aiWords: insertContext.aiWords, limitPct: insertContext.limitPct, onFinalSubmission: insertContext.onFinalSubmission, notesTitle: insertContext.notesTitle } : undefined;
    const hint = !onInsertArtifact && isPage && thesisId ? t("assistant.artifact.insertInEditor") : undefined;
    let skeletons = 0;
    if (m.streaming) {
      const st = artifactBlockState(m.content);
      skeletons = Math.max(0, st.complete + (st.pending ? 1 : 0) - (m.artifacts?.length || 0) - (m.artifactErrors?.length || 0));
    }
    if (!m.artifacts?.length && !m.artifactErrors?.length && !skeletons) return null;
    return (
      <div className="min-w-0">
        {(m.artifacts || []).map((a) => (
          <ArtifactCard
            key={a.id}
            artifact={a}
            insertable={insertable && !!(a.interactionId || m.interactionId) && !m.streaming}
            onAction={(action) => toggleArtifactAction(m.id, a.id, action)}
            done={artifactDone && artifactDone.artifactId === a.id ? artifactDone.action : null}
            insertHint={hint}
            costCard={artifactPending && artifactPending.msgId === m.id && artifactPending.artifactId === a.id ? <ArtifactCostCard artifact={a} action={artifactPending.action} ctx={ctx} onConfirm={confirmArtifact} onCancel={() => setArtifactPending(null)} /> : null}
          />
        ))}
        {(m.artifactErrors || []).map((e, i) => (
          <ArtifactErrorCard key={`err-${i}`} error={e} />
        ))}
        {Array.from({ length: Math.min(skeletons, 4) }, (_, i) => (
          <ArtifactSkeleton key={`sk-${i}`} file={computingFile ? attachedName(computingFile) : undefined} />
        ))}
      </div>
    );
  };

  const isPage = variant === "page";
  const column = isPage ? "max-w-3xl w-full mx-auto" : "";
  const modeLabel = (id?: AIMode) => t(`assistant.mode.${id || "chat"}.short`);
  const modeDescription = t(`assistant.mode.${mode}.description`);
  const placeholderLabel = modeLabel(mode);
  /** A provider failure in words the student can act on; the raw provider payload stays in the server log. */
  const providerErrorText = (e: { message: string; code?: string }) =>
    e.code === "auth" ? t("assistant.msg.errorAuth") : e.code === "rate_limit" ? t("assistant.msg.errorRateLimit") : e.code === "refusal" ? e.message : e.code === "provider" ? t("assistant.msg.errorProvider") : e.message;

  const renderCostCard = (m: ChatMsg) => {
    if (!pending || pending.id !== m.id) return null;
    const n = countWordsInText(m.content.replace(DEMO_NOTE_RE, ""));
    const noun = t(`assistant.cost.noun.${INSERT_NOUN[m.mode || mode] || "answer"}`);
    const words = n === 1 ? t("assistant.cost.aiWords_one") : t("assistant.cost.aiWords", { n });
    const ctx = insertContext;
    const cur = ctx && ctx.wordCount > 0 ? Math.round((ctx.aiWords / ctx.wordCount) * 100) : 0;
    const nextExact = ctx ? ((ctx.aiWords + n) / (ctx.wordCount + n || 1)) * 100 : 0;
    const next = Math.round(nextExact);
    // Notes live in the Research notes tab, which does not count toward the Final submission's AI share.
    const over = !!ctx && pending.action !== "notes" && nextExact > ctx.limitPct;
    return (
      <div className="mt-2 border border-prov-ai-line bg-prov-ai-soft rounded-xl p-3" role="group" aria-label={t("assistant.cost.title")}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-prov-ai" />
          <span className="text-xs font-semibold text-prov-ai-deep">{t("assistant.cost.title")}</span>
        </div>
        <div className="text-[12.5px] leading-normal text-gray-700">
          {pending.action === "notes" ? rich(t("assistant.cost.notes", { noun, words, notes: ctx?.notesTitle || t("editor.notesTab") })) : ctx ? rich(t("assistant.cost.withLimit", { noun, words, cur, next, limit: ctx.limitPct })) : rich(t("assistant.cost.noLimit", { noun, words }))}
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

  const renderUser = (m: ChatMsg) => {
    const pool = [...attached, ...(paperSources || [])];
    const names = (m.attachmentIds || []).map((id) => pool.find((x) => x.id === id)).filter((x): x is AttachedSource => !!x).map((x) => ({ id: x.id, name: attachedName(x), kind: x.kind }));
    return (
      <div key={m.id} className="self-end max-w-[85%] flex flex-col items-end gap-1">
        <div className="text-sm leading-normal px-3 py-[9px] rounded-[12px_12px_2px_12px] bg-brand-600 text-white whitespace-pre-wrap">{m.content}</div>
        {names.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {names.map((n) => (
              <span key={n.id} className="inline-flex items-center gap-1 max-w-full rounded-[10px] bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[11px]">
                {n.kind === "sheet" ? <FileSpreadsheet className="w-3 h-3 flex-shrink-0" aria-hidden="true" /> : <FileText className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
                <span className="truncate max-w-[12rem]">{n.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAssistant = (m: ChatMsg) => {
    const shown = m.streaming ? stripPartialArtifactBlocks(m.content) : extractArtifactBlocks(m.content).text;
    return (
      <div key={m.id} className="min-w-0">
        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400 flex-wrap">
          <span>
            {/* The server's label is an English literal for the demo assistant: shown in the interface language. */}
            {m.demo || m.provider === "demo" ? t("assistant.chip.demo") : m.label || t("glossary.assistant")} · {modeLabel(m.mode)}
          </span>
          {!m.error && <span className="px-[7px] py-px rounded-full bg-brand-50 text-brand-700 font-semibold">{t("assistant.msg.logged")}</span>}
          {m.blocked && <span className="badge-danger !text-[10px] !py-0">{t("assistant.msg.blocked")}</span>}
          {m.demo && <span className="badge bg-gray-100 text-gray-500 !text-[10px] !py-0">{t("assistant.msg.demo")}</span>}
          {m.useSources && !m.error && (
            <span className={`badge !text-[10px] !py-0 inline-flex items-center gap-1 ${m.groundedPassages ? "bg-accent-50 text-accent-800" : "bg-gray-100 text-gray-500"}`}>
              <BookOpen className="w-3 h-3" aria-hidden />
              {m.groundedPassages ? t(m.groundedPassages === 1 ? "assistant.msg.passages_one" : "assistant.msg.passages", { n: m.groundedPassages }) : t("assistant.msg.noPassages")}
            </span>
          )}
        </div>
        {m.notice && !m.error && <div className="mb-1 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">{m.notice}</div>}
        {m.demo && !m.error && !m.streaming && <div className="mb-1 text-[11px] text-gray-500">{t("assistant.msg.demoNotice")}</div>}
        {(shown || m.streaming || m.error) && (
          <div className={`text-sm leading-[1.55] px-3 py-2.5 rounded-[12px_12px_12px_2px] text-gray-900 ${m.blocked ? "bg-amber-50 border border-amber-100" : "bg-gray-100"}`}>
            {m.streaming && !shown && !m.error ? (
              <div className="flex items-center gap-2.5 py-0.5 text-[13px] text-gray-500">
                <LogoSpinner size={28} label={t("assistant.msg.thinking")} />
                <span aria-hidden="true">{t("assistant.msg.thinking")}</span>
              </div>
            ) : (
              <Markdown text={shown} tableNotice={t("assistant.md.tableNotice")} />
            )}
            {m.error && <div className="mt-2 text-xs text-red-600">{m.error}</div>}
            {m.streaming && shown && <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />}
          </div>
        )}
        <GroundedNote files={m.groundedFiles} />
        {renderArtifacts(m)}
        {!m.streaming && shown && renderActions(m)}
        {!m.streaming && shown && renderCostCard(m)}
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
        <div ref={headerMenusRef} className="contents">
        <div className="relative flex-shrink-0">
          <button onClick={() => { setHistoryOpen(false); setProviderOpen((o) => !o); }} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-1.5 max-w-[150px]" aria-label={t("assistant.provider.aria")} aria-expanded={providerOpen} data-tour="model">
            <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${chipColor ? "" : "bg-gray-400"}`} style={chipColor ? { background: chipColor } : undefined} />
            <span className="truncate">{chipText}</span>
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          </button>
          {providerOpen && (
            <div className="absolute right-0 mt-1 w-72 max-w-[calc(100vw-24px)] bg-white rounded-[10px] shadow-xl border border-gray-100 z-20 py-1 text-sm">
              {!(allowance?.institutionPays && readyInstitution.length) && (
                <button onClick={() => { setProviderChoice("auto"); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${providerChoice === "auto" ? "text-brand-600 font-medium" : ""}`}>
                  {t("assistant.provider.autoAccount")}
                </button>
              )}
              {allowance?.institutionPays && institutionModels.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">{t("glossary.providedByUniversity")}</div>
                  {allowance.usage ? (
                    <AllowanceSummary allowance={allowance} usage={allowance.usage} />
                  ) : (
                    allowanceUsed !== null && (
                      <>
                        <div className="px-3 pb-1 text-[11px] text-gray-500">{t("assistant.provider.used", { spent: fmt.number(allowance.spentStudent, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), limit: fmt.number(allowance.perStudentMonthly), currency: allowance.currency })}</div>
                        <div className="mx-3 mb-1 h-1 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${allowanceUsed >= 100 ? "bg-red-500" : allowanceUsed >= 80 ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${allowanceUsed}%` }} /></div>
                      </>
                    )
                  )}
                  {institutionModels.map((m) => (
                    <button key={m.id} disabled={!m.ready || allowance.exhausted !== "none"} onClick={() => { setProviderChoice(m.id); setProviderOpen(false); }} title={`${m.backendName} · ${m.region}`} className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40 ${providerChoice === m.id ? "text-brand-600 font-medium" : ""}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span className="flex-1 truncate">{m.label}</span>
                      <span className="text-[10px] text-gray-400">{!m.ready ? t("assistant.provider.unavailable") : allowance.exhausted !== "none" ? t("assistant.provider.allowanceUsed") : m.region}</span>
                    </button>
                  ))}
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">{t("assistant.provider.ownAccounts")}</div>
                </>
              )}
              {providers.filter((p) => !institutionModels.some((m) => m.id === `platform:${p.id}`)).map((p) => (
                <button key={p.id} disabled={!p.allowedByPolicy || !(p.connection?.status === "active" || p.platformKey)} onClick={() => { setProviderChoice(p.id); setProviderOpen(false); }} className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-40 ${providerChoice === p.id ? "text-brand-600 font-medium" : ""}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="flex-1">{p.product}</span>
                  <span className="text-[10px] text-gray-400">{p.connection?.status === "active" ? t("assistant.provider.yourAccount") : p.platformKey ? t("assistant.provider.institution") : t("assistant.provider.unavailable")}</span>
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
          <button onClick={() => { setProviderOpen(false); setHistoryOpen((o) => !o); }} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center" aria-label={t("assistant.history.aria")} aria-expanded={historyOpen}>
            <History className="w-4 h-4" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 mt-1 w-72 bg-white rounded-[10px] shadow-xl border border-gray-100 z-20 max-h-80 overflow-y-auto text-sm">
              <button onClick={newChat} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-brand-600 font-medium border-b border-gray-100">
                <Plus className="w-4 h-4" /> {t("assistant.history.new")}
              </button>
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.06em] text-gray-400 border-b border-gray-100">{t("assistant.history.forMode", { mode: mode === "copilot" ? t("glossary.copilot") : t(`assistant.mode.${mode}.label`) })}</div>
              {modeConversations.length === 0 && <div className="px-3 py-4 text-xs text-gray-400">{t("assistant.history.empty")}</div>}
              {modeConversations.map((c) => (
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
            onClick={() => { chooseMode("copilot"); if (messages.length) setModesOpen(false); }}
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
                onClick={() => { chooseMode(m.id); if (messages.length) setModesOpen(false); }}
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
            {mode === "copilot" ? (
              <p className="text-xs text-accent-800 bg-accent-50 rounded-lg px-2.5 py-1.5">
                <strong>{t("glossary.copilot")}</strong>{t("assistant.copilot.noteRest")}
              </p>
            ) : (
              <p>
                <strong className="text-gray-700">{placeholderLabel}</strong>
                {` — ${modeDescription.replace(/^([^A-Za-zÀ-ÿ]*)([A-ZÀ-Ý])/, (_m, p, c) => p + c.toLowerCase())}${/[.?!…]$/.test(modeDescription) ? "" : "."}`}
              </p>
            )}
            {dataChips.length > 0 && chipSheet ? (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-[12px] font-medium text-gray-500 min-w-0">
                  <FileSpreadsheet className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("assistant.attach.chipsFrom", { file: attachedName(chipSheet) })}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dataChips.map((c) => (
                    <button key={c.label} onClick={() => send(c.prompt)} className="text-xs px-2.5 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 text-left">
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: QUICK_COUNT[mode] }, (_, i) => t(`assistant.mode.${mode}.suggestion${i + 1}`)).map((q) => (
                  <button key={q} onClick={() => send(q)} className="text-xs px-2.5 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 text-left">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m) => (m.role === "user" ? renderUser(m) : renderAssistant(m)))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className={`px-4 pt-3 pb-3.5 border-t border-gray-100 flex-shrink-0 ${column}`}>
        {privacyFor && <PrivacyNotice fileName={privacyFor.name} sheet={isSheetName(privacyFor.name)} onAttach={() => uploadFile(privacyFor)} onCancel={() => setPrivacyFor(null)} />}
        {attachError && (
          <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700">
            <span className="flex-1 min-w-0 break-words">{attachError}</span>
            <button type="button" onClick={() => setAttachError("")} className="p-0.5 text-red-400 hover:text-red-700" aria-label={t("common.close")}>
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}
        {copilotOn && <AttachmentChips attached={attached} uploading={uploading} readAs={readAsLine} onRemove={(id) => setAttached((list) => list.filter((x) => x.id !== id))} disabled={loading} />}
        {copilotOn && messages.length > 0 && laterChips.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1" aria-label={chipSheet ? t("assistant.attach.chipsFrom", { file: attachedName(chipSheet) }) : undefined} role="group">
            {laterChips.map((c) => (
              <button key={c.label} onClick={() => send(c.prompt)} disabled={loading} className="text-[11.5px] px-2 py-0.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 text-left disabled:opacity-40">
                {c.label}
              </button>
            ))}
          </div>
        )}
        {thesisId && (
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setUseSources((v) => !v)} aria-pressed={useSources} className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg border ${useSources ? "bg-accent-50 border-accent-200 text-accent-800" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`} title={t("assistant.sources.title")}>
              <BookOpen className="w-3.5 h-3.5" />{useSources ? t("assistant.sources.on") : t("assistant.sources.button")}
            </button>
            {useSources && <span className="text-[11px] text-gray-400">{t("assistant.sources.note")}</span>}
          </div>
        )}
        <div className="flex items-end gap-2 bg-gray-50 rounded-xl px-3 py-[9px] border border-gray-200 focus-within:border-brand-400">
          {showClip && (
            <>
              <AttachMenu
                disabledReason={!thesisId ? t("assistant.attach.needPaper") : undefined}
                canUpload={!!ownPaper && !ownPaper.locked}
                loading={attachLoading}
                paperItems={paperItems}
                libraryItems={ownPaper && !ownPaper.locked ? libraryItems : []}
                onOpen={openAttachMenu}
                onUpload={() => fileInputRef.current?.click()}
                onPick={pickExisting}
                busy={!!uploading}
              />
              <input ref={fileInputRef} type="file" accept={UPLOAD_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pickFile(e.target.files?.[0])} />
            </>
          )}
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

/**
 * The student's allowance in words a student can act on: interactions left this month, share used, when it resets,
 * what the current pace means, and what one interaction costs. The tutor sees the same figures in Admin → AI access.
 */
function AllowanceSummary({ allowance, usage }: { allowance: AllowanceInfo; usage: NonNullable<AllowanceInfo["usage"]> }) {
  const t = useT();
  const fmt = useFormat();
  const money = (n: number) => fmt.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const resetDate = fmt.date(usage.resetsAt, { day: "numeric", month: "long" });
  const exhausted = allowance.exhausted !== "none";
  const pct = usage.usedPercent ?? usage.institutionPercent;
  const barColor = exhausted || (pct ?? 0) >= 100 ? "bg-red-500" : (pct ?? 0) >= 80 ? "bg-amber-400" : "bg-brand-500";
  const headline = exhausted
    ? t("assistant.allowance.remainingNone")
    : usage.remainingRequests === null
      ? t("assistant.allowance.unlimited")
      : t(usage.remainingRequests <= 20 ? "assistant.allowance.remainingFew" : "assistant.allowance.remaining", { n: fmt.number(usage.remainingRequests) });
  const pace =
    usage.requests === 0 || usage.usedPercent === null
      ? null
      : usage.runsOutAt && !exhausted
        ? { text: t("assistant.allowance.paceRunsOut", { date: fmt.date(usage.runsOutAt, { day: "numeric", month: "long" }) }), warn: true }
        : usage.projectedPercent !== null && !exhausted
          ? { text: t("assistant.allowance.pace", { percent: fmt.number(Math.min(usage.projectedPercent, 999)) }), warn: usage.projectedPercent >= 80 }
          : null;
  return (
    <div className="px-3 pb-2 border-b border-gray-100 mb-1" aria-live="polite">
      <p className={`text-[13px] font-semibold leading-snug ${exhausted ? "text-red-600" : "text-gray-900"}`}>{headline}</p>
      {pct !== null && (
        <div className="mt-1.5 mb-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
      <p className="text-[11px] text-gray-600 leading-snug">
        {usage.usedPercent !== null
          ? t("assistant.allowance.detail", { percent: fmt.number(usage.usedPercent), spent: money(allowance.spentStudent), limit: fmt.number(allowance.perStudentMonthly), currency: allowance.currency, requests: fmt.number(usage.requests) })
          : t("assistant.allowance.detailNoCap", { requests: fmt.number(usage.requests), spent: money(allowance.spentStudent), currency: allowance.currency })}
      </p>
      {usage.usedPercent === null && usage.institutionPercent !== null && <p className="text-[11px] text-gray-600 leading-snug">{t("assistant.allowance.institution", { percent: fmt.number(usage.institutionPercent) })}</p>}
      <p className="text-[11px] text-gray-600 leading-snug">{t("assistant.allowance.reset", { date: resetDate, days: fmt.number(usage.daysLeft) })}</p>
      {pace && <p className={`mt-1 text-[11px] leading-snug ${pace.warn ? "text-amber-700" : "text-gray-500"}`}>{pace.text}</p>}
      <p className="mt-1 text-[11px] text-gray-400 leading-snug">
        {t("assistant.allowance.what", { cost: money(usage.costPerRequest), currency: allowance.currency })} {usage.remaining !== null && t(allowance.atLimit === "block" ? "assistant.allowance.thenBlock" : "assistant.allowance.thenOwn")}
      </p>
    </div>
  );
}
