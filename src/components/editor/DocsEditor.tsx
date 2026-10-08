"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BubbleMenu, EditorContent, useEditor, type Editor } from "@tiptap/react";
import { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import LinkExt from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Typography from "@tiptap/extension-typography";
import { ArrowLeft, BookMarked, Bot, ChevronDown, CloudOff, File, FileCheck, FileText, ListTree, Lock, MessageSquare, MessageSquarePlus, MoreHorizontal, MoreVertical, Plus, Scale, Search as SearchIcon, ShieldCheck, X } from "lucide-react";
import { CitationMark, CitedPassage, CommentMark, FontSize, Indent, LineHeight, PageBreak, Provenance, ProvenanceStats, Search } from "./extensions";
import { Pagination } from "./pagination";
import CitationDialog, { CitationInsert } from "./CitationDialog";
import Toolbar from "./Toolbar";
import { MenuAction, MenuOverflow } from "./MenuBar";
import SessionBar from "./SessionBar";
import ProvenanceGutter from "./ProvenanceGutter";
import { CommentsPanel, FindPanel, IntegrityLedger, OutlinePanel, ReferencesPanel, useNoticeLabel, VersionsPanel } from "./Sidebars";
import { ConfirmDialog, ImageDialog, LinkDialog, PageSetupDialog, PasteAttributionDialog, PasteDecision, ShareDialog, ShortcutsDialog, TableDialog, TextPromptDialog, VersionPreviewDialog, WordCountDialog, PasteMatchInfo } from "./Dialogs";
import { CommentItem, FlagItem, formatReference, formatTimeAgo, IntegrityBreakdown, IntegrityFix, InteractionLite, Reference, richText, SidebarKind, statusLabel, ThesisDoc, ThesisTab, VersionItem } from "./types";
import AssistantPanel, { InsertMeta } from "../ai/AssistantPanel";
import { LanguageReview } from "./language/languageReview";
import { LanguageReviewPanel } from "./language/LanguageReviewPanel";
import ReviewerPanel from "./reviewer/ReviewerPanel";
import CiteVerifiedPanel from "./citations/CiteVerifiedPanel";
import ProcessPanel from "./process/ProcessPanel";
import { recordSnapshot } from "./process/useSnapshots";
import SourcesPanel from "./sources/SourcesPanel";
import EvidencePanel from "./evidence/EvidencePanel";
import ConsentModal from "../ConsentModal";
import { IntegrityPill, Modal, Toast } from "../ui";
import { useUser, type Consent } from "../useUser";
import { api, ApiError, countWordsInText } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n";
import { translate, type Translate } from "@/lib/i18n/dictionary";
import { acquireSessionMonitor, releaseSessionMonitor, SessionMonitor, type MonitorFlag, type MonitorHandlers, type MonitorMetrics } from "@/lib/monitor";
import { downloadBlob, htmlToDocx, htmlToMarkdown, htmlToText, safeFileName, standaloneHtml } from "@/lib/export";

interface LoadResponse {
  thesis: ThesisDoc;
  comments: CommentItem[];
  flags: FlagItem[];
  versionCount: number;
  policy: { maxAiUsagePercent: number; requireConsent: boolean; university: string };
  interactions?: InteractionLite[];
  integrityBreakdown?: IntegrityBreakdown;
}

const GUTTER_KEY = "provenance_gutter";
/** The "Research notes" tab is found by title in any language, so switching language never creates a duplicate. */
const isNotesTitle = (title: string) => LOCALES.some((l) => translate(l, "editor.notesTab").toLowerCase() === title.trim().toLowerCase());

const PASTE_DIALOG_MIN_WORDS = 30;
const SUBMISSION = "submission";
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

export default function DocsEditor({ thesisId, reviewMode = false }: { thesisId: string; reviewMode?: boolean }) {
  const [data, setData] = useState<LoadResponse | null>(null);
  const t = useT();
  const [error, setError] = useState("");
  const { user, loading } = useUser();

  useEffect(() => {
    api<LoadResponse>(`/api/theses/${thesisId}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [thesisId]);

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-6">
        <div>
          <div className="text-gray-500 mb-4">{error}</div>
          <Link href="/dashboard" className="btn-primary">{t("editor.backToDashboard")}</Link>
        </div>
      </div>
    );
  if (!data || loading || !user) return <div className="min-h-screen bg-[#f1f3f4] flex items-center justify-center text-gray-400 text-sm">{t("editor.loadingDocument")}</div>;
  return <DocsEditorInner initial={data} thesisId={thesisId} userId={user.id} userRole={user.role} reviewMode={reviewMode} />;
}

function DocsEditorInner({ initial, thesisId, userId, userRole, reviewMode }: { initial: LoadResponse; thesisId: string; userId: string; userRole: string; reviewMode: boolean }) {
  const router = useRouter();
  // `t` is stable and always reads the current locale, so closures captured by the editor never go stale.
  const tLive = useT();
  const tRef = useRef<Translate>(tLive);
  tRef.current = tLive;
  const t = useCallback<Translate>((key, vars) => tRef.current(key, vars), []);
  const fmt = useFormat();
  const finalSubmission = t("glossary.finalSubmission");
  const aiAssisted = t("glossary.aiAssisted");
  const { me, refresh: refreshMe } = useUser();
  const [thesis, setThesis] = useState<ThesisDoc>(initial.thesis);
  const [comments, setComments] = useState<CommentItem[]>(initial.comments);
  const [flags, setFlags] = useState<FlagItem[]>(initial.flags);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const isOwner = thesis.studentId === userId;
  const canEdit = isOwner && !["approved", "submitted"].includes(thesis.status);

  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [lastSaved, setLastSaved] = useState<string>(thesis.updatedAt);
  const [sidebar, setSidebar] = useState<SidebarKind>(reviewMode ? "comments" : "none");
  // Provenance gutter + highlights: on by default, remembered per browser, always on in review mode.
  const [showProvenance, setShowProvenanceState] = useState(true);
  const setShowProvenance = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      if (reviewMode) return;
      setShowProvenanceState((prev) => {
        const next = typeof v === "function" ? v(prev) : v;
        try { localStorage.setItem(GUTTER_KEY, next ? "1" : "0"); } catch { /* private mode */ }
        return next;
      });
    },
    [reviewMode]
  );
  useEffect(() => {
    if (reviewMode) return;
    try { if (localStorage.getItem(GUTTER_KEY) === "0") setShowProvenanceState(false); } catch { /* ignore */ }
  }, [reviewMode]);
  const [breakdown, setBreakdown] = useState<IntegrityBreakdown | null>(initial.integrityBreakdown ?? null);
  const [interactions, setInteractions] = useState<InteractionLite[]>(initial.interactions ?? []);
  const [payer, setPayer] = useState<string | undefined>(undefined);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  /** Pages measured by the pagination plugin (desktop); the word estimate is the fallback on phones. */
  const [pageCount, setPageCount] = useState(0);
  /** Assistant/side panel width, draggable from its left edge and remembered per browser. */
  const [panelWidth, setPanelWidth] = useState(400);
  const panelDrag = useRef<{ startX: number; startW: number } | null>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("assistant_width"));
      if (saved >= 320) setPanelWidth(Math.min(saved, Math.floor(window.innerWidth * 0.6)));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const onPanelResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    panelDrag.current = { startX: e.clientX, startW: panelWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPanelResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDrag.current) return;
    const max = Math.max(360, Math.floor(window.innerWidth * 0.6));
    setPanelWidth(Math.min(max, Math.max(320, panelDrag.current.startW + (panelDrag.current.startX - e.clientX))));
  };
  const onPanelResizeEnd = () => {
    if (!panelDrag.current) return;
    panelDrag.current = null;
    try {
      localStorage.setItem("assistant_width", String(panelWidth));
    } catch {
      /* ignore */
    }
  };
  const [spellcheck, setSpellcheck] = useState(true);
  const [focus, setFocus] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingComment, setPendingComment] = useState<{ anchorId: string; quote: string } | null>(null);
  const [confirmPromote, setConfirmPromote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "link" | "image" | "table" | "pageSetup" | "wordCount" | "share" | "rename" | "saveVersion" | "submit" | "shortcuts" | "about" | "consent">(null);
  const [linkInitial, setLinkInitial] = useState("");
  const [paste, setPaste] = useState<{ words: number; text: string; html: string; matched: PasteMatchInfo | null; fingerprint: string | null } | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string; label: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<Record<string, number> | null>(null);
  const monitorRef = useRef<SessionMonitor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const lastCounts = useRef({ chars: 0, words: 0 });
  /** >0 while the editor itself is changing the document (AI insertion, declared paste, citation, bibliography…): not typing. */
  const programmaticDepth = useRef(0);
  const noticeLabel = useNoticeLabel();

  // ---------- document tabs ----------
  // "submission" is the Final submission tab (thesis.content): the only one submitted, reviewed and scored.
  const [tabs, setTabs] = useState<ThesisTab[]>(initial.thesis.tabs || []);
  const [activeTab, setActiveTab] = useState<string>(SUBMISSION);
  const [tabMenu, setTabMenu] = useState<string | null>(null);
  const [tabWords, setTabWords] = useState(0);
  const activeTabRef = useRef<string>(SUBMISSION);
  const tabsRef = useRef<ThesisTab[]>(tabs);
  tabsRef.current = tabs;
  const contentsRef = useRef<Record<string, string>>({ [SUBMISSION]: initial.thesis.content, ...Object.fromEntries((initial.thesis.tabs || []).map((t) => [t.id, t.content])) });
  const dirtyKeys = useRef<Set<string>>(new Set());
  const tabsMetaDirty = useRef(false);
  const internalCopy = useRef<string>("");

  // ---------- citations ----------
  const [citeMode, setCiteMode] = useState<null | "selection" | "cursor" | "library">(null);
  const citeRange = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const [citeText, setCiteText] = useState("");
  const policy = initial.policy;

  const notify = useCallback((message: string, kind: "info" | "success" | "error" = "info") => setToast({ message, kind }), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // The assistant panel starts open on wide screens (README 4.7).
  useEffect(() => {
    if (!reviewMode && isOwner && window.innerWidth >= 1280) setSidebar("ai");
  }, [reviewMode, isOwner]);

  // Who pays for institution-provided models, for the cost card shown before any AI insertion.
  useEffect(() => {
    if (!isOwner) return;
    api<{ allowance?: { institutionPays?: boolean } | null }>("/api/ai/providers")
      .then((d) => setPayer(d.allowance?.institutionPays ? "institution" : undefined))
      .catch(() => {});
  }, [isOwner]);

  // The pill and the ledger always read the same numbers: every server answer that carries metrics goes through here.
  const applyMetrics = useCallback((m: Partial<MonitorMetrics> | null | undefined) => {
    if (!m) return;
    if (m.integrityBreakdown) setBreakdown(m.integrityBreakdown as IntegrityBreakdown);
    setThesis((t) => ({ ...t, integrityScore: m.integrityScore ?? t.integrityScore, aiUsagePercent: m.aiUsagePercent ?? t.aiUsagePercent }));
  }, []);

  // Ledger rows and AI log come from the server (the formula lives in src/lib/integrity.ts); refreshed when the score or notices change.
  const refreshLedger = useCallback(async () => {
    try {
      const d = await api<LoadResponse>(`/api/theses/${thesisId}`);
      applyMetrics({ integrityScore: d.thesis.integrityScore, aiUsagePercent: d.thesis.aiUsagePercent, integrityBreakdown: d.integrityBreakdown });
      if (d.interactions) setInteractions(d.interactions);
    } catch { /* keep the previous ledger */ }
  }, [thesisId, applyMetrics]);

  /** Runs editor commands that are not the student typing: the typing counters skip the resulting transactions. */
  const programmatic = useCallback(<T,>(fn: () => T): T => {
    programmaticDepth.current++;
    try {
      return fn();
    } finally {
      programmaticDepth.current--;
    }
  }, []);

  // ---------- editor ----------
  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      LanguageReview,
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      LinkExt.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: t("editor.placeholder") }),
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      Typography,
      Provenance,
      ProvenanceStats,
      CommentMark,
      LineHeight,
      Indent,
      PageBreak,
      Pagination.configure({ onPages: (n: number) => setPageCount(n) }),
      Search,
      CitedPassage,
      CitationMark,
    ],
    content: initial.thesis.content,
    editorProps: {
      attributes: { class: "docs-editor", spellcheck: "true" },
      handleClick: (_view, _pos, event) => {
        const el = (event.target as HTMLElement).closest?.(".thesisfic-comment") as HTMLElement | null;
        if (el) {
          setActiveCommentId(el.getAttribute("data-comment-id"));
          setSidebar("comments");
        }
        return false;
      },
      handleDOMEvents: {
        copy: (view) => {
          const { from, to } = view.state.selection;
          internalCopy.current = norm(view.state.doc.textBetween(from, to, " "));
          return false;
        },
        cut: (view) => {
          const { from, to } = view.state.selection;
          internalCopy.current = norm(view.state.doc.textBetween(from, to, " "));
          return false;
        },
      },
      handlePaste: (view, event) => {
        if (!canEdit) return false;
        const text = event.clipboardData?.getData("text/plain") || "";
        const html = event.clipboardData?.getData("text/html") || "";
        const words = countWordsInText(text);
        if (!words) return false;
        // Moving your own text between tabs keeps its marks (AI, pasted, citations) and needs no attribution.
        if (internalCopy.current && norm(text) === internalCopy.current) return false;
        if (words >= PASTE_DIALOG_MIN_WORDS) {
          event.preventDefault();
          openPasteDialog(text, html);
          return true;
        }
        // Small paste: let ProseMirror handle it, fingerprint in the background and attribute if it matches an AI copy.
        const from = view.state.selection.from;
        monitorRef.current?.recordPaste(text).then(({ match: matched }) => {
          if (!matched || !editorRef.current) return;
          const ed = editorRef.current;
          const to = Math.min(from + text.length, ed.state.doc.content.size);
          if (matched.kind === "source") {
            const srcLabel = `${matched.authors || matched.title || t("editor.source")}${matched.year ? ` (${matched.year})` : ""}${matched.page ? `, p. ${matched.page}` : ""}`;
            programmatic(() => ed.chain().setTextSelection({ from, to }).setProvenance({ source: "paste", label: srcLabel }).setTextSelection(to).run());
            notify(t("editor.toast.pasteMatchesSource", { source: matched.title || t("editor.aSource") }), "info");
            return;
          }
          const label = matched.mode === "copilot" ? t("editor.label.copilot") : t("editor.label.assistant");
          programmatic(() => ed.chain().setTextSelection({ from, to }).setProvenance({ source: "ai", provider: matched.provider, label, interactionId: matched.interactionId }).setTextSelection(to).run());
          monitorRef.current?.recordAiInsert(words, matched.provider || "assistant", matched.mode || "paste", matched.interactionId);
          notify(t("editor.toast.pastedFromAssistant", { label, aiAssisted }), "info");
        });
        return false;
      },
      handleKeyDown: (_view, event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return false;
        const k = event.key.toLowerCase();
        if (k === "s") { event.preventDefault(); saveNowRef.current(); return true; }
        if (k === "h") { event.preventDefault(); setSidebar("find"); return true; }
        if (k === "k") { event.preventDefault(); openLink(); return true; }
        if (k === "p") { event.preventDefault(); window.print(); return true; }
        if (k === "m" && event.altKey) { event.preventDefault(); startComment(); return true; }
        if (k === "c" && event.shiftKey) { event.preventDefault(); setDialog("wordCount"); return true; }
        if (k === "/") { event.preventDefault(); setDialog("shortcuts"); return true; }
        if (k === "e" && event.altKey) { event.preventDefault(); openCite(); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!canEdit) return;
      dirtyRef.current = true;
      dirtyKeys.current.add(activeTabRef.current);
      setSaveState("unsaved");
      scheduleSave();
      const chars = ed.storage.characterCount.characters();
      const words = ed.storage.characterCount.words();
      setTabWords(words);
      const isPaste = transaction.getMeta("paste") || transaction.getMeta("uiEvent") === "paste";
      const charDelta = chars - lastCounts.current.chars;
      // Typing is counted only for what the student types: not pastes, not editor commands (insertions, citations,
      // declarations) and not a single transaction that adds more text than any keystroke or IME composition can.
      const isTyping = !isPaste && !transaction.getMeta("ai-insert") && programmaticDepth.current === 0 && charDelta <= 40;
      if (isTyping) monitorRef.current?.recordTyping(charDelta, words - lastCounts.current.words);
      lastCounts.current = { chars, words };
      if (activeTabRef.current === SUBMISSION) scheduleProvenance(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      setSelectionText(empty ? "" : ed.state.doc.textBetween(from, to, " "));
      const id = ed.getAttributes("commentMark").id as string | undefined;
      if (id) setActiveCommentId(id);
    },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    lastCounts.current = { chars: editor.storage.characterCount.characters(), words: editor.storage.characterCount.words() };
    setTabWords(lastCounts.current.words);
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(canEdit, false);
  }, [editor, canEdit]);

  // ---------- provenance (live, client-side) ----------
  const provTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleProvenance = (ed: Editor) => {
    if (provTimer.current) clearTimeout(provTimer.current);
    provTimer.current = setTimeout(() => {
      let ai = 0, paste = 0, declaration = 0;
      ed.state.doc.descendants((node) => {
        if (!node.isText || !node.text) return;
        const m = node.marks.find((x) => x.type.name === "provenance");
        if (!m) return;
        const w = countWordsInText(node.text);
        // The AI-use declaration appendix is a record, not thesis text: excluded from every total (as on the server).
        if (m.attrs.declaration) declaration += w;
        else if (m.attrs.source === "ai") ai += w;
        else paste += w;
      });
      const total = Math.max(0, ed.storage.characterCount.words() - declaration);
      setThesis((t) => ({ ...t, wordCount: total, provenance: { human: Math.max(0, total - ai - paste), ai, paste } }));
    }, 400);
  };

  // ---------- saving ----------
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNowRef.current(), 2500);
  };
  const saveNow = useCallback(
    async (extra: Record<string, unknown> = {}) => {
      const ed = editorRef.current;
      if (!ed || !canEdit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      contentsRef.current[activeTabRef.current] = ed.getHTML();
      const dirty = new Set(dirtyKeys.current);
      const metaDirty = tabsMetaDirty.current;
      const payload: Record<string, unknown> = { sessionId: sessionId || undefined, ...extra };
      const tabsDirty = metaDirty || Array.from(dirty).some((k) => k !== SUBMISSION);
      if (dirty.has(SUBMISSION) || !tabsDirty) payload.content = contentsRef.current[SUBMISSION];
      if (tabsDirty) payload.tabs = tabsRef.current.map((t) => ({ id: t.id, title: t.title, content: contentsRef.current[t.id] ?? t.content }));
      dirtyKeys.current.clear();
      tabsMetaDirty.current = false;
      setSaveState("saving");
      try {
        const res = await api<{ thesis: ThesisDoc; integrityBreakdown?: IntegrityBreakdown; flags?: FlagItem[] }>(`/api/theses/${thesisId}`, { method: "PUT", json: payload });
        dirtyRef.current = false;
        setThesis((t) => ({ ...t, ...res.thesis, content: t.content }));
        setLastSaved(new Date().toISOString());
        setSaveState("saved");
        // The saved document is what the server scores: the pill and the ledger update together from this answer.
        applyMetrics({ integrityScore: res.thesis.integrityScore, aiUsagePercent: res.thesis.aiUsagePercent, integrityBreakdown: res.integrityBreakdown });
        if (res.flags?.length) {
          const fresh = res.flags;
          setFlags((prev) => [...fresh.filter((f) => !prev.some((p) => p.id === f.id)), ...prev]);
          notify(t("editor.toast.newNotice", { notice: noticeLabel(fresh[0].type) }), "error");
        }
        // Process record: a hash-chained snapshot of the tab that was saved (throttled client- and server-side).
        const tabId = activeTabRef.current;
        recordSnapshot(thesisId, { tabId, html: contentsRef.current[tabId] || "", wordCount: countWordsInText(ed.getText()), sessionId: sessionId || undefined });
      } catch (e) {
        dirty.forEach((k) => dirtyKeys.current.add(k));
        if (metaDirty) tabsMetaDirty.current = true;
        setSaveState("error");
        notify(t("editor.toast.saveFailed", { message: (e as Error).message }), "error");
      }
    },
    [canEdit, thesisId, sessionId, notify, applyMetrics, noticeLabel, t]
  );
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  // ---------- tab operations ----------
  const loadIntoEditor = useCallback((html: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.commands.setContent(html || "<p></p>", false);
    // fresh state so undo never crosses into another tab
    const st = ed.state;
    ed.view.updateState(EditorState.create({ doc: st.doc, plugins: st.plugins, schema: st.schema }));
    lastCounts.current = { chars: ed.storage.characterCount.characters(), words: ed.storage.characterCount.words() };
    setTabWords(lastCounts.current.words);
    setSelectionText("");
  }, []);

  const switchTab = useCallback(
    (id: string) => {
      const ed = editorRef.current;
      if (!ed || id === activeTabRef.current) return;
      contentsRef.current[activeTabRef.current] = ed.getHTML();
      activeTabRef.current = id;
      setActiveTab(id);
      setTabMenu(null);
      loadIntoEditor(contentsRef.current[id] ?? "<p></p>");
      if (id === SUBMISSION) scheduleProvenance(ed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadIntoEditor]
  );

  const markTabsChanged = () => {
    tabsMetaDirty.current = true;
    dirtyRef.current = true;
    setSaveState("unsaved");
    scheduleSave();
  };

  const addTab = (title = t("editor.untitledTab"), content = "<p></p>") => {
    const id = `tab_${Date.now().toString(36)}`;
    contentsRef.current[id] = content;
    setTabs((ts) => [...ts, { id, title, content, updatedAt: new Date().toISOString() }]);
    tabsRef.current = [...tabsRef.current, { id, title, content, updatedAt: new Date().toISOString() }];
    markTabsChanged();
    setTimeout(() => switchTab(id), 0);
  };

  const renameTab = (id: string, title: string) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t)));
    tabsRef.current = tabsRef.current.map((t) => (t.id === id ? { ...t, title } : t));
    markTabsChanged();
  };

  const deleteTab = (id: string) => {
    if (activeTabRef.current === id) switchTab(SUBMISSION);
    setTabs((ts) => ts.filter((t) => t.id !== id));
    tabsRef.current = tabsRef.current.filter((t) => t.id !== id);
    delete contentsRef.current[id];
    markTabsChanged();
  };

  const duplicateTab = (id: string) => {
    const ed = editorRef.current;
    if (ed) contentsRef.current[activeTabRef.current] = ed.getHTML();
    const src = id === SUBMISSION ? { title: finalSubmission } : tabsRef.current.find((tb) => tb.id === id);
    addTab(t("editor.tabCopy", { title: src?.title || t("editor.tab") }), contentsRef.current[id] || "<p></p>");
  };

  /** Makes a working tab the Final submission; the previous submission becomes a working tab, nothing is lost. */
  const promoteTab = (id: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    contentsRef.current[activeTabRef.current] = ed.getHTML();
    const tab = tabsRef.current.find((tb) => tb.id === id);
    if (!tab) return;
    const oldSubmission = contentsRef.current[SUBMISSION];
    contentsRef.current[SUBMISSION] = contentsRef.current[id];
    contentsRef.current[id] = oldSubmission;
    renameTab(id, t("editor.previousSubmission", { date: fmt.date(new Date()) }));
    dirtyKeys.current.add(SUBMISSION);
    dirtyKeys.current.add(id);
    activeTabRef.current = SUBMISSION;
    setActiveTab(SUBMISSION);
    loadIntoEditor(contentsRef.current[SUBMISSION]);
    scheduleProvenance(ed);
    saveNowRef.current({ versionKind: "manual", versionLabel: t("editor.versionLabel.replaced", { title: tab.title }) });
    notify(t("editor.toast.promoted", { title: tab.title, finalSubmission }), "success");
  };

  // ---------- citations ----------
  const openCite = (mode?: "library") => {
    const ed = editorRef.current;
    if (!ed) return;
    if (mode === "library") {
      setCiteText("");
      setCiteMode("library");
      return;
    }
    if (!canEdit) return notify(t("editor.toast.readOnly"), "error");
    const { from, to, empty } = ed.state.selection;
    citeRange.current = { from, to };
    setCiteText(empty ? "" : ed.state.doc.textBetween(from, to, " ").slice(0, 1500));
    setCiteMode(empty ? "cursor" : "selection");
  };

  const insertCitation = (c: CitationInsert, mode: "selection" | "cursor" | "library") => {
    const ed = editorRef.current;
    if (!ed) return;
    const refs = c.isNew ? [...thesis.references, c.reference] : thesis.references.map((r) => (r.id === c.reference.id ? c.reference : r));
    setThesis((t) => ({ ...t, references: refs }));
    updateThesis({ references: refs });
    if (mode === "library") {
      notify(c.isNew ? t("editor.toast.referenceAdded") : t("editor.toast.referenceUpdated"), "success");
      return;
    }
    const { from, to } = citeRange.current;
    const max = ed.state.doc.content.size;
    const a = Math.min(from, max), b = Math.min(to, max);
    const chain = ed.chain().focus();
    if (mode === "selection" && b > a) {
      chain.setTextSelection({ from: a, to: b });
      if (c.markPassage) chain.setCitedPassage(c.reference.id);
      if (c.linkUrl) chain.setLink({ href: c.linkUrl });
    }
    const at = mode === "selection" ? b : a;
    const before = at > 1 ? ed.state.doc.textBetween(at - 1, at, " ") : " ";
    const nodes = [
      ...(before && before !== " " ? [{ type: "text", text: " " }] : []),
      { type: "text", text: c.inText, marks: [{ type: "citation", attrs: { refId: c.reference.id } }] },
    ];
    programmatic(() => chain.insertContentAt(at, nodes).run());
    notify(t(c.isNew ? "editor.toast.citationInsertedNew" : "editor.toast.citationInserted", { cite: c.inText }), "success");
  };

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // ---------- writing session + consent ----------
  // One session per open editor: a remount (React strict mode, a quick back-and-forth) reuses the session that
  // `acquireSessionMonitor` keeps for a few seconds instead of starting a second, empty one.
  const monitorHandlers = useMemo<MonitorHandlers>(
    () => ({
      onFlags: (fl: MonitorFlag[]) => {
        setFlags((prev) => [...fl.filter((f) => !prev.some((p) => p.id === f.id)).map((f) => ({ ...f, timestamp: new Date().toISOString(), resolved: false })), ...prev]);
        notify(t("editor.toast.newNotice", { notice: noticeLabel(fl[0].type) }), "error");
        refreshLedger();
      },
      onStats: setSessionStats,
      onMetrics: applyMetrics,
    }),
    [notify, refreshLedger, applyMetrics, noticeLabel, t]
  );
  const startSession = useCallback(async () => {
    if (!isOwner || monitorRef.current) return;
    try {
      const monitor = await acquireSessionMonitor(
        `thesis:${thesisId}`,
        async () => {
          const res = await api<{ session: { id: string }; consent: Consent | null }>(`/api/theses/${thesisId}/sessions`, { method: "POST" });
          const scopes = res.consent?.scopes || { keystrokes: false, paste: true, aiInteractions: true, tabActivity: false };
          return new SessionMonitor(res.session.id, scopes, monitorHandlers);
        },
        monitorHandlers
      );
      if (!monitor) return;
      monitorRef.current = monitor;
      setSessionId(monitor.sessionId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 428) setDialog("consent");
      else notify((e as Error).message, "error");
    }
  }, [isOwner, thesisId, notify, monitorHandlers]);

  useEffect(() => {
    if (sidebar === "integrity") refreshLedger();
  }, [sidebar, flags.length, refreshLedger]);

  // Escape closes the mobile bottom sheet (the desktop panels keep their own close button).
  useEffect(() => {
    if (!isMobile || sidebar === "none") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebar("none"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, sidebar]);

  useEffect(() => {
    if (!isOwner) return;
    if (policy.requireConsent && !me?.consent) setDialog("consent");
    else startSession();
    return () => {
      releaseSessionMonitor(`thesis:${thesisId}`);
      monitorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // ---------- helpers ----------
  const insertWithProvenance = (html: string, meta: InsertMeta, replace: boolean, opts: { atEnd?: boolean; message?: string } = {}) => {
    if (!editor || !canEdit) return notify(t("editor.toast.readOnly"), "error");
    if (opts.atEnd) editor.commands.focus("end");
    programmatic(() => {
      const chain = editor.chain().focus();
      if (replace) chain.deleteSelection();
      const from = replace ? editor.state.selection.from : editor.state.selection.to;
      chain.insertContent(html).run();
      const to = editor.state.selection.to;
      editor.chain().setTextSelection({ from, to }).setProvenance({ source: "ai", provider: meta.provider, label: meta.model, interactionId: meta.interactionId }).setTextSelection(to).setMeta("ai-insert", true).run();
    });
    monitorRef.current?.recordAiInsert(meta.words, meta.provider, meta.mode, meta.interactionId);
    notify(opts.message || t("editor.toast.aiInserted", { words: meta.words, aiAssisted, provider: meta.provider }), "success");
    // Save right away so the score, the AI share and the AI log reflect the insertion without waiting for the autosave.
    saveNowRef.current().then(refreshLedger);
  };

  /** "Keep as notes": the answer goes to the Research notes tab (created when missing), marked as AI-assisted. */
  const keepAsNotes = (html: string, meta: InsertMeta) => {
    if (!canEdit) return notify(t("editor.toast.readOnly"), "error");
    const notesTitle = t("editor.notesTab");
    const message = t("editor.toast.keptAsNotes", { notes: notesTitle, aiAssisted, finalSubmission });
    const existing = tabsRef.current.find((tb) => isNotesTitle(tb.title));
    if (existing) {
      switchTab(existing.id);
      setTimeout(() => insertWithProvenance(`${html}<p></p>`, meta, false, { atEnd: true, message }), 0);
      return;
    }
    if (tabsRef.current.length >= 20) return notify(t("editor.toast.tabLimit", { notes: notesTitle }), "error");
    addTab(notesTitle);
    setTimeout(() => insertWithProvenance(html, meta, false, { atEnd: true, message }), 30);
  };

  /** "Add as comment": the answer becomes a comment anchored to the current selection. */
  const addCommentFromAssistant = async (text: string) => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return notify(t("editor.toast.selectPassage"), "info");
    const quote = editor.state.doc.textBetween(from, to, " ").slice(0, 200);
    const anchorId = `cmt_${Date.now().toString(36)}`;
    if (canEdit) editor.chain().setComment(anchorId).run();
    try {
      const res = await api<{ comment: CommentItem }>(`/api/theses/${thesisId}/comments`, { method: "POST", json: { anchorId, quote, text } });
      setComments((c) => [...c, res.comment]);
      setActiveCommentId(res.comment.id);
      if (canEdit) saveNow();
      notify(t("editor.toast.commentAdded"), "success");
    } catch (e) {
      if (canEdit) editor.commands.unsetComment(anchorId);
      notify((e as Error).message, "error");
    }
  };

  const clearSelectionContext = () => {
    setSelectionText("");
    if (editor && !editor.state.selection.empty) editor.commands.setTextSelection(editor.state.selection.to);
  };

  /** Ledger actions: each deduction row points to the place where the student can act on it. */
  const handleFix = (fix: IntegrityFix) => {
    if (!editor) return;
    if (fix === "reduce_ai") {
      setShowProvenance(true);
      setSidebar("ai");
      notify(t("editor.toast.reduceAi"), "info");
      return;
    }
    if (fix === "attribute_paste") {
      setShowProvenance(true);
      if (activeTabRef.current !== SUBMISSION) switchTab(SUBMISSION);
      setTimeout(() => {
        let found: { from: number; to: number } | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (found || !node.isText) return;
          const m = node.marks.find((x) => x.type.name === "provenance" && x.attrs.source === "paste" && !x.attrs.label);
          if (m) found = { from: pos, to: pos + node.nodeSize };
        });
        if (!found) return notify(t("editor.toast.allPastesNamed"), "success");
        editor.chain().focus().setTextSelection(found).run();
        const dom = editor.view.domAtPos((found as { from: number }).from).node;
        ((dom as HTMLElement).nodeType === 1 ? (dom as HTMLElement) : (dom as Text).parentElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
        notify(t("editor.toast.pasteSelected"), "info");
      }, 0);
    }
  };

  /** A long paste (dialog): recorded as pending while the student says where it comes from. */
  const openPasteDialog = (text: string, html: string) => {
    const words = countWordsInText(text);
    (async () => {
      const r = await monitorRef.current?.recordPaste(text, "pending");
      setPaste({ words, text, html, matched: r?.match || null, fingerprint: r?.fingerprint || null });
    })();
  };

  /**
   * The student's declaration for a long paste. "own" inserts it as Written; "source"/"ai" mark it with the label;
   * "none" (dialog dismissed) inserts it as pasted without attribution, which the ledger shows and may open a notice.
   * The insertion is an editor command, never typing, and the declaration completes the pending paste on the server.
   */
  const decidePaste = (decision: PasteDecision | "none", label?: string) => {
    if (!paste || !editor) return;
    const p = paste;
    setPaste(null);
    const paragraphs = p.text.split(/\n{2,}|\r\n\r\n/).map((s) => s.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = decision === "own" && p.html ? p.html : paragraphs.map((s) => `<p>${esc(s)}</p>`).join("");
    const m = p.matched;
    programmatic(() => {
      const from = editor.state.selection.from;
      editor.chain().focus().insertContent(html).run();
      const to = editor.state.selection.to;
      if (decision !== "own") {
        editor.chain().setTextSelection({ from, to }).setProvenance({ source: decision === "ai" ? "ai" : "paste", label: label || undefined, provider: decision === "ai" ? m?.provider || label?.toLowerCase() : undefined, interactionId: decision === "ai" ? m?.interactionId : undefined }).setTextSelection(to).run();
      }
    });
    if (decision === "ai") monitorRef.current?.recordAiInsert(p.words, m?.provider || label || "external", m?.mode || "paste", m?.interactionId);
    const declared = monitorRef.current?.declarePaste(p.fingerprint, decision, label) || Promise.resolve(null);
    // Save right away: the pill, the ledger and any notice come from the saved document, not from the autosave delay.
    declared.then(() => saveNowRef.current());
  };

  const openLink = () => {
    if (!editor) return;
    setLinkInitial((editor.getAttributes("link").href as string) || "");
    setDialog("link");
  };

  const startComment = () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return notify(t("editor.toast.selectText"), "info");
    const quote = editor.state.doc.textBetween(from, to, " ").slice(0, 200);
    const anchorId = `cmt_${Date.now().toString(36)}`;
    if (canEdit) programmatic(() => editor.chain().focus().setComment(anchorId).run());
    // Collapse the selection so the bubble menu closes while the comment is written.
    editor.commands.setTextSelection(to);
    setPendingComment({ anchorId, quote });
    setSidebar("comments");
  };

  const createComment = async (text: string) => {
    if (!pendingComment) return;
    try {
      const res = await api<{ comment: CommentItem }>(`/api/theses/${thesisId}/comments`, { method: "POST", json: { ...pendingComment, text } });
      setComments((c) => [...c, res.comment]);
      setActiveCommentId(res.comment.id);
      setPendingComment(null);
      if (canEdit) saveNow();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };

  const jumpToComment = (c: CommentItem) => {
    if (!editor) return;
    setActiveCommentId(c.id);
    let found: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.marks.some((m) => m.type.name === "commentMark" && m.attrs.id === c.anchorId)) found = pos;
    });
    if (found === null && c.quote) {
      const idx = editor.state.doc.textContent.indexOf(c.quote.slice(0, 40));
      if (idx >= 0) {
        editor.state.doc.descendants((node, pos) => {
          if (found !== null || !node.isText) return;
          if (node.text && node.text.includes(c.quote.slice(0, 40))) found = pos + node.text.indexOf(c.quote.slice(0, 40));
        });
      }
    }
    if (found === null) {
      const other = Object.entries(contentsRef.current).find(([k, html]) => k !== activeTabRef.current && html.includes(`data-comment-id="${c.anchorId}"`));
      if (other) {
        switchTab(other[0]);
        setTimeout(() => jumpToComment(c), 50);
        return;
      }
    }
    if (found !== null) {
      editor.commands.setTextSelection(found + 1);
      const dom = editor.view.domAtPos(found + 1).node;
      ((dom as HTMLElement).nodeType === 1 ? (dom as HTMLElement) : (dom as Text).parentElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const loadVersions = useCallback(async () => {
    const d = await api<{ versions: VersionItem[] }>(`/api/theses/${thesisId}/versions`).catch(() => ({ versions: [] }));
    setVersions(d.versions);
  }, [thesisId]);
  useEffect(() => {
    if (sidebar === "versions") loadVersions();
  }, [sidebar, loadVersions]);

  const download = async (fmt: "docx" | "html" | "md" | "txt") => {
    if (!editor) return;
    const html = editor.getHTML();
    const tabTitle = activeTab === SUBMISSION ? "" : tabs.find((t) => t.id === activeTab)?.title || "";
    const name = safeFileName(tabTitle ? `${thesis.title} - ${tabTitle}` : thesis.title);
    try {
      if (fmt === "docx") downloadBlob(`${name}.docx`, await htmlToDocx(html, { title: thesis.title, author: thesis.studentName, orientation: thesis.pageSetup.orientation, marginCm: thesis.pageSetup.margin, lineSpacing: thesis.pageSetup.lineSpacing }));
      if (fmt === "html") downloadBlob(`${name}.html`, new Blob([standaloneHtml(html, thesis.title)], { type: "text/html" }));
      if (fmt === "md") downloadBlob(`${name}.md`, new Blob([htmlToMarkdown(html)], { type: "text/markdown" }));
      if (fmt === "txt") downloadBlob(`${name}.txt`, new Blob([htmlToText(html)], { type: "text/plain" }));
    } catch (e) {
      notify(t("editor.toast.exportFailed", { message: (e as Error).message }), "error");
    }
  };

  const insertBibliography = () => {
    if (!editor) return;
    const refs = [...thesis.references].sort((a, b) => a.authors.localeCompare(b.authors));
    const items = refs.map((r, i) => `<p>${thesis.citationStyle === "IEEE" ? `[${i + 1}] ` : ""}${formatReference(r, thesis.citationStyle).full}</p>`).join("");
    programmatic(() => editor.chain().focus().insertContent(`<h2>${t("editor.doc.references")}</h2>${items}`).run());
  };

  const insertToc = () => {
    if (!editor) return;
    const items: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading" && node.attrs.level > 1) items.push(`<li><p>${"&nbsp;&nbsp;".repeat(node.attrs.level - 2)}${node.textContent}</p></li>`);
    });
    programmatic(() => editor.chain().focus().insertContent(`<h2>${t("editor.doc.toc")}</h2><ul>${items.join("") || `<li><p>${t("editor.doc.noHeadings")}</p></li>`}</ul>`).run());
  };

  const insertFootnote = () => {
    if (!editor) return;
    const n = (editor.state.doc.textContent.match(/\[\d+\]/g) || []).length + 1;
    programmatic(() => {
      editor.chain().focus().insertContent(`<sup>[${n}]</sup>`).run();
      const end = editor.state.doc.content.size;
      editor.chain().insertContentAt(end, `<p><sup>[${n}]</sup> ${t("editor.doc.footnoteText")}</p>`).setTextSelection(editor.state.doc.content.size - t("editor.doc.footnoteText").length - 1).run();
    });
  };

  const updateThesis = async (patch: Record<string, unknown>, successMsg?: string) => {
    try {
      const res = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}`, { method: "PUT", json: patch });
      setThesis((t) => ({ ...t, ...res.thesis, content: t.content }));
      if (successMsg) notify(successMsg, "success");
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };

  /** Text pasted from the menu (clipboard API): long pastes open the attribution dialog like Ctrl+V does. */
  const pasteText = (text: string) => {
    if (!editor || !canEdit) return;
    const words = countWordsInText(text);
    if (!words) return;
    if (words >= PASTE_DIALOG_MIN_WORDS) return openPasteDialog(text, "");
    const from = editor.state.selection.from;
    editor.chain().focus().insertContent(text.replace(/</g, "&lt;")).setMeta("paste", true).run();
    const insertedTo = editor.state.selection.to;
    monitorRef.current?.recordPaste(text).then(({ match }) => {
      if (!match || !editorRef.current) return;
      const label = match.kind === "source" ? `${match.authors || match.title || t("editor.source")}${match.year ? ` (${match.year})` : ""}` : match.mode === "copilot" ? t("editor.label.copilot") : t("editor.label.assistant");
      programmatic(() => editorRef.current!.chain().setTextSelection({ from, to: insertedTo }).setProvenance(match.kind === "source" ? { source: "paste", label } : { source: "ai", provider: match.provider, label, interactionId: match.interactionId }).setTextSelection(insertedTo).run());
    });
  };

  const onAction = (a: MenuAction) => {
    if (!editor) return;
    const c = () => editor.chain().focus();
    const map: Partial<Record<MenuAction, () => void>> = {
      new: () => router.push("/dashboard/theses?new=1"),
      open: () => router.push("/dashboard/theses"),
      rename: () => setDialog("rename"),
      save: () => saveNow(),
      saveVersion: () => setDialog("saveVersion"),
      versions: () => setSidebar("versions"),
      share: () => setDialog("share"),
      submit: () => setDialog("submit"),
      "dl-docx": () => download("docx"),
      "dl-html": () => download("html"),
      "dl-md": () => download("md"),
      "dl-txt": () => download("txt"),
      print: () => window.print(),
      pageSetup: () => setDialog("pageSetup"),
      wordCount: () => setDialog("wordCount"),
      undo: () => c().undo().run(),
      redo: () => c().redo().run(),
      cut: () => document.execCommand("cut"),
      copy: () => document.execCommand("copy"),
      // Menu paste goes through the same attribution flow as Ctrl+V.
      paste: () => navigator.clipboard?.readText().then((txt) => txt && pasteText(txt)).catch(() => notify(t("editor.toast.useCtrlV"), "info")),
      pastePlain: () => navigator.clipboard?.readText().then((txt) => txt && pasteText(txt)).catch(() => notify(t("editor.toast.useCtrlShiftV"), "info")),
      selectAll: () => c().selectAll().run(),
      find: () => setSidebar("find"),
      outline: () => setSidebar((s) => (s === "outline" ? "none" : "outline")),
      comments: () => setSidebar((s) => (s === "comments" ? "none" : "comments")),
      ai: () => setSidebar((s) => (s === "ai" ? "none" : "ai")),
      integrity: () => setSidebar((s) => (s === "integrity" ? "none" : "integrity")),
      references: () => setSidebar("references"),
      provenance: () => setShowProvenance((v) => !v),
      "zoom-50": () => setZoom(50), "zoom-75": () => setZoom(75), "zoom-100": () => setZoom(100), "zoom-125": () => setZoom(125), "zoom-150": () => setZoom(150),
      fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),
      focus: () => setFocus((f) => !f),
      image: () => setDialog("image"),
      table: () => setDialog("table"),
      link: openLink,
      comment: startComment,
      pageBreak: () => c().setPageBreak().run(),
      hr: () => c().setHorizontalRule().run(),
      date: () => programmatic(() => c().insertContent(fmt.date(new Date(), { year: "numeric", month: "long", day: "numeric" })).run()),
      citation: () => openCite(),
      toc: insertToc,
      footnote: insertFootnote,
      bold: () => c().toggleBold().run(), italic: () => c().toggleItalic().run(), underline: () => c().toggleUnderline().run(), strike: () => c().toggleStrike().run(), superscript: () => c().toggleSuperscript().run(), subscript: () => c().toggleSubscript().run(),
      p: () => c().setParagraph().run(), h1: () => c().toggleHeading({ level: 1 }).run(), h2: () => c().toggleHeading({ level: 2 }).run(), h3: () => c().toggleHeading({ level: 3 }).run(), h4: () => c().toggleHeading({ level: 4 }).run(),
      blockquote: () => c().toggleBlockquote().run(), codeBlock: () => c().toggleCodeBlock().run(),
      alignLeft: () => c().setTextAlign("left").run(), alignCenter: () => c().setTextAlign("center").run(), alignRight: () => c().setTextAlign("right").run(), alignJustify: () => c().setTextAlign("justify").run(),
      "ls-1": () => c().setLineHeight("1").run(), "ls-1.15": () => c().setLineHeight("1.15").run(), "ls-1.5": () => c().setLineHeight("1.5").run(), "ls-2": () => c().setLineHeight("2").run(),
      bullets: () => c().toggleBulletList().run(), numbers: () => c().toggleOrderedList().run(), checklist: () => c().toggleTaskList().run(), indent: () => c().indent().run(), outdent: () => c().outdent().run(),
      clearFormat: () => c().unsetAllMarks().clearNodes().run(),
      spellcheck: () => setSpellcheck((v) => !v),
      privacy: () => setDialog("consent"),
      copilot: () => { setSidebar("ai"); },
      reviewer: () => setSidebar((s) => (s === "reviewer" ? "none" : "reviewer")),
      language: () => setSidebar((s) => (s === "language" ? "none" : "language")),
      cite: () => setSidebar((s) => (s === "cite" ? "none" : "cite")),
      process: () => setSidebar((s) => (s === "process" ? "none" : "process")),
      sources: () => setSidebar((s) => (s === "sources" ? "none" : "sources")),
      evidence: () => setSidebar((s) => (s === "evidence" ? "none" : "evidence")),
      shortcuts: () => setDialog("shortcuts"),
      about: () => setDialog("about"),
    };
    map[a]?.();
  };

  const restoreSubmission = (t: ThesisDoc) => {
    contentsRef.current[SUBMISSION] = t.content;
    if (activeTabRef.current !== SUBMISSION) {
      activeTabRef.current = SUBMISSION;
      setActiveTab(SUBMISSION);
    }
    loadIntoEditor(t.content);
    setThesis((x) => ({ ...x, ...t, tabs: x.tabs }));
  };

  const stats = useMemo(() => {
    if (!editor) return { words: 0, chars: 0, charsNoSpaces: 0, paragraphs: 0, headings: 0, pages: 0, readingMin: 0 };
    const words = editor.storage.characterCount.words();
    const chars = editor.storage.characterCount.characters();
    let paragraphs = 0, headings = 0;
    editor.state.doc.descendants((n) => {
      if (n.type.name === "paragraph" && n.textContent.trim()) paragraphs++;
      if (n.type.name === "heading") headings++;
    });
    return { words, chars, charsNoSpaces: editor.state.doc.textContent.replace(/\s/g, "").length, paragraphs, headings, pages: Math.max(1, Math.ceil(words / 350)), readingMin: Math.max(1, Math.round(words / 200)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, dialog, thesis.wordCount]);

  const versionKind = (k: string) => {
    const key = `editor.versions.kind.${k}`;
    const l = t(key);
    return l === key ? k : l;
  };
  const aiPct = thesis.wordCount ? Math.round((thesis.provenance.ai / thesis.wordCount) * 100) : 0;
  // One number for the pill and the ledger: the server's breakdown when it has arrived, the stored score until then.
  const integrityScore = breakdown?.score ?? thesis.integrityScore;
  const pastePct = thesis.wordCount ? Math.round((thesis.provenance.paste / thesis.wordCount) * 100) : 0;
  const ws = thesis.pageSetup;
  const workspaceClass = `docs-workspace ${ws.orientation === "landscape" ? "landscape" : ""} ${ws.size === "Letter" ? "letter" : ""} ${showProvenance ? "show-provenance" : ""}`;

  if (!editor) return <div className="min-h-screen bg-[#f1f3f4] flex items-center justify-center text-gray-400 text-sm">{t("editor.preparing")}</div>;

  const sidebarPanel = () => {
    switch (sidebar) {
      case "outline": return <OutlinePanel editor={editor} onClose={() => setSidebar("none")} />;
      case "comments": return (
        <CommentsPanel comments={comments} activeId={activeCommentId} canResolve={userRole !== "student" || isOwner} userId={userId} onJump={jumpToComment} onClose={() => setSidebar("none")} pendingQuote={pendingComment ? pendingComment.quote : null} onCreate={createComment}
          onCancelCreate={() => { if (pendingComment && canEdit) editor.commands.unsetComment(pendingComment.anchorId); setPendingComment(null); }}
          onReply={async (id, text) => { const r = await api<{ comment: CommentItem }>(`/api/theses/${thesisId}/comments/${id}`, { method: "POST", json: { text } }).catch(() => null); if (r) setComments((cs) => cs.map((x) => (x.id === id ? { ...x, replies: r.comment.replies } : x))); }}
          onResolve={async (id, resolved) => { await api(`/api/theses/${thesisId}/comments/${id}`, { method: "PATCH", json: { resolved } }).catch(() => {}); setComments((cs) => cs.map((x) => (x.id === id ? { ...x, resolved } : x))); const cm = comments.find((x) => x.id === id); if (resolved && cm && canEdit) { editor.commands.unsetComment(cm.anchorId); saveNow(); } }}
          onDelete={async (id) => { await api(`/api/theses/${thesisId}/comments/${id}`, { method: "DELETE" }).catch(() => {}); const cm = comments.find((x) => x.id === id); if (cm && canEdit) { editor.commands.unsetComment(cm.anchorId); saveNow(); } setComments((cs) => cs.filter((x) => x.id !== id)); }}
        />
      );
      case "versions": return (
        <VersionsPanel versions={versions} canRestore={canEdit} onClose={() => setSidebar("none")} onCreate={() => setDialog("saveVersion")}
          onPreview={async (id) => { const d = await api<{ version: { content: string; label?: string; kind: string; createdAt: string } }>(`/api/theses/${thesisId}/versions/${id}`).catch(() => null); if (d) setPreview({ id, html: d.version.content, label: d.version.label || `${versionKind(d.version.kind)} · ${fmt.dateTime(d.version.createdAt)}` }); }}
          onRestore={async (id) => { const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}/versions/${id}`, { method: "POST" }).catch((e) => { notify((e as Error).message, "error"); return null; }); if (d) { restoreSubmission(d.thesis); notify(t("editor.toast.versionRestored", { finalSubmission }), "success"); loadVersions(); } }}
        />
      );
      case "references": return (
        <ReferencesPanel references={thesis.references} style={thesis.citationStyle} canEdit={canEdit} onClose={() => setSidebar("none")}
          onChangeStyle={(s) => updateThesis({ citationStyle: s })}
          onAdd={(r: Reference) => updateThesis({ references: [...thesis.references, r] }, t("editor.toast.referenceAddedShort"))}
          onRemove={(id) => updateThesis({ references: thesis.references.filter((r) => r.id !== id) })}
          onInsertInText={(r) => programmatic(() => editor.chain().focus().insertContent(formatReference(r, thesis.citationStyle).inText).run())}
          onInsertBibliography={insertBibliography}
          onAddWithAi={() => openCite("library")}
        />
      );
      case "find": return <FindPanel editor={editor} onClose={() => setSidebar("none")} canEdit={canEdit} />;
      case "reviewer": return (
        <ReviewerPanel editor={editor} thesisId={thesisId} sessionId={sessionId || undefined} userId={userId} selectionText={selectionText} canEdit={canEdit} onClose={() => setSidebar("none")}
          onCommentsChanged={() => { api<{ comments: CommentItem[] }>(`/api/theses/${thesisId}/comments`).then((d) => setComments(d.comments)).catch(() => {}); if (canEdit) saveNow(); }}
          onJumpToComment={(anchorId) => setActiveCommentId(comments.find((c) => c.anchorId === anchorId)?.id ?? anchorId)}
        />
      );
      case "language": return <LanguageReviewPanel editor={editor} thesisId={thesisId} sessionId={sessionId || undefined} canEdit={canEdit} onClose={() => setSidebar("none")} />;
      case "cite": return (
        <CiteVerifiedPanel editor={editor} thesisId={thesisId} sessionId={sessionId || undefined} selectionText={selectionText} references={thesis.references} citationStyle={thesis.citationStyle} canEdit={canEdit} onClose={() => setSidebar("none")} onConsentRequired={() => setDialog("consent")}
          onInsertCitation={(ref, o) => {
            const { from, to } = editor.state.selection;
            const hasSel = from !== to;
            citeRange.current = { from, to };
            insertCitation({ reference: ref, isNew: !thesis.references.some((r) => r.id === ref.id), inText: formatReference(ref, thesis.citationStyle).inText, linkUrl: o.link, markPassage: hasSel && o.markPassage }, hasSel ? "selection" : "cursor");
          }}
          onReferencesChanged={(refs) => { setThesis((t) => ({ ...t, references: refs })); }}
          onAddToLibrary={(w) => { api(`/api/theses/${thesisId}/sources`, { method: "POST", json: w.doi ? { kind: "doi", value: w.doi, title: w.title } : { kind: "url", value: w.url, title: w.title } }).then(() => notify(t("editor.toast.sourceAdded"), "success")).catch((e) => notify((e as Error).message, "error")); }}
        />
      );
      case "process": return (
        <ProcessPanel thesisId={thesisId} isOwner={canEdit} sessionId={sessionId || undefined} onClose={() => setSidebar("none")} onOpenConsent={() => setDialog("consent")}
          onInsertDeclaration={(html) => { if (activeTabRef.current !== SUBMISSION) switchTab(SUBMISSION); programmatic(() => editor.chain().focus("end").insertContent(html).run()); saveNow(); notify(t("editor.toast.declarationAppended", { finalSubmission }), "success"); }}
        />
      );
      case "sources": return (
        <SourcesPanel thesisId={thesisId} canEdit={canEdit} selectionText={selectionText} sessionId={sessionId || undefined} onConsentRequired={() => setDialog("consent")} onClose={() => setSidebar("none")}
          onInsertCitation={(ref) => { const reference: Reference = { id: `ref_${Date.now().toString(36)}`, type: ref.doi ? "article" : "web", ...ref }; const { from, to } = editor.state.selection; citeRange.current = { from, to }; insertCitation({ reference, isNew: !thesis.references.some((r) => r.doi && r.doi === ref.doi), inText: formatReference(reference, thesis.citationStyle).inText, markPassage: false }, "cursor"); }}
        />
      );
      case "evidence": return (
        <EvidencePanel editor={editor} thesisId={thesisId} sessionId={sessionId || undefined} selectionText={selectionText} canEdit={canEdit} onClose={() => setSidebar("none")}
          onFindSupport={() => setSidebar("cite")}
          onAnchor={() => { const id = `cmt_${Date.now().toString(36)}`; editor.chain().setComment(id).run(); return id; }}
        />
      );
      case "integrity": return (
        <IntegrityLedger thesis={thesis} flags={flags} session={sessionStats} maxAi={policy.maxAiUsagePercent} breakdown={breakdown} showProvenance={showProvenance} onToggleProvenance={() => setShowProvenance((v) => !v)} onFix={handleFix} isOwner={isOwner} onClose={() => setSidebar("none")}
          onRespondFlag={async (id, note) => { await api(`/api/flags/${id}`, { method: "PATCH", json: { studentNote: note } }).catch(() => {}); setFlags((fs) => fs.map((f) => (f.id === id ? { ...f, description: `${f.description}\n\n${t("editor.studentResponse")}: ${note}` } : f))); notify(t("editor.toast.responseSent"), "success"); }}
        />
      );
      case "ai": return (
        <AssistantPanel
          thesisId={thesisId}
          sessionId={sessionId || undefined}
          selection={selectionText}
          onInsert={canEdit ? (h, m) => insertWithProvenance(h, m, false) : undefined}
          onReplaceSelection={canEdit ? (h, m) => insertWithProvenance(h, m, true) : undefined}
          onConsentRequired={() => setDialog("consent")}
          onRejectSuggestion={(m) => monitorRef.current?.recordAiRejected(m.provider, m.mode)}
          insertContext={{ wordCount: thesis.wordCount, aiWords: thesis.provenance.ai, limitPct: policy.maxAiUsagePercent, payer }}
          onClearSelection={clearSelectionContext}
          onAddComment={addCommentFromAssistant}
          onKeepAsNotes={canEdit ? keepAsNotes : undefined}
        />
      );
      default: return null;
    }
  };

  const panelTitle = (k: SidebarKind) => {
    const key = k === "ai" ? "glossary.aiAssistant" : k === "integrity" ? "glossary.integrityLedger" : `editor.panel.${k}`;
    const l = t(key);
    return l === key ? k : l;
  };

  const saveLabel = saveState === "saving" ? t("editor.save.saving") : saveState === "unsaved" ? t("editor.save.unsavedChanges") : saveState === "error" ? t("editor.save.failedRetry") : t("editor.save.savedAgo", { ago: formatTimeAgo(lastSaved, t, (d) => fmt.date(d)) });

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden" style={{ ["--doc-zoom" as string]: zoom / 100, ["--page-margin" as string]: `${ws.margin}cm`, ["--doc-line-height" as string]: ws.lineSpacing }}>
      {/* Header (52px) */}
      <header className="h-[52px] flex items-center gap-2 md:gap-3 pl-2 pr-3 bg-white border-b border-gray-200 flex-shrink-0" style={{ paddingTop: "env(safe-area-inset-top, 0px)", height: "calc(52px + env(safe-area-inset-top, 0px))" }}>
        <Link href={userRole === "student" ? "/dashboard" : "/admin/theses"} className="w-8 h-8 inline-flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0" aria-label={t("common.back")}><ArrowLeft className="w-[18px] h-[18px]" /></Link>
        <div className="hidden md:flex w-[30px] h-[30px] bg-brand-600 rounded-lg items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-white" /></div>
        <div className="min-w-0 flex-1 flex items-center gap-2 md:min-w-[200px]">
          <button onClick={() => canEdit && setDialog("rename")} className={`text-[16px] font-semibold truncate text-gray-900 ${canEdit ? "hover:bg-gray-100 rounded px-1 -mx-1" : "cursor-default"}`} title={canEdit ? t("editor.header.renameHint", { title: thesis.title }) : thesis.title}>{thesis.title}</button>
          {!canEdit && <span className="hidden sm:inline badge bg-gray-100 text-gray-500 !text-[10px] flex-shrink-0">{t("editor.readOnlyBadge")}</span>}
        </div>
        {isOwner && (
          <span className="flex items-center gap-1.5 text-[12px] text-gray-400 whitespace-nowrap flex-shrink-0" title={saveLabel}>
            {saveState === "error" ? <CloudOff className="w-3.5 h-3.5 text-red-500" /> : <span className={`w-1.5 h-1.5 rounded-full ${saveState === "saved" ? "bg-green-500" : saveState === "saving" ? "bg-gray-300 animate-pulse" : "bg-amber-400"}`} />}
            {saveState === "saved" ? t("editor.save.saved") : saveState === "saving" ? t("editor.save.saving") : saveState === "unsaved" ? t("editor.save.unsaved") : t("editor.save.failed")}
          </span>
        )}
        <IntegrityPill aiPct={aiPct} pastePct={pastePct} limitPct={policy.maxAiUsagePercent} score={integrityScore} onClick={() => setSidebar((x) => (x === "integrity" ? "none" : "integrity"))} className="hidden md:inline-flex flex-shrink-0" />
        {/* The assistant thinks with the author: a reviewer reads the thesis, so the panel is not offered in review. */}
        {isOwner && <button onClick={() => setSidebar((x) => (x === "ai" ? "none" : "ai"))} className={`hidden md:inline-flex items-center gap-1.5 px-3 py-[7px] rounded-full text-[13px] font-semibold flex-shrink-0 ${sidebar === "ai" ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"}`} aria-pressed={sidebar === "ai"}><Bot className="w-[15px] h-[15px]" />{t("glossary.aiAssistant")}</button>}
        <button onClick={() => setDialog("share")} className="hidden md:inline-flex items-center px-3.5 py-[7px] rounded-full bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 flex-shrink-0">{t("editor.share")}</button>
        {!isMobile && <MenuOverflow editor={editor} onAction={onAction} state={{ showProvenance, sidebar, spellcheck, zoom, focus, canEdit }} />}
        <button onClick={() => setMobileMenu(true)} className="md:hidden p-2 text-gray-600" aria-label={t("common.more")}><MoreVertical className="w-5 h-5" /></button>
      </header>

      {/* Toolbar */}
      {!focus && (
        <Toolbar editor={editor} zoom={zoom} onZoom={setZoom} onLink={openLink} onImage={() => setDialog("image")} onTable={() => setDialog("table")} onComment={startComment} onCite={() => openCite()} onPrint={() => window.print()} spellcheck={spellcheck} onSpellcheck={setSpellcheck} compact={isMobile} provenance={{ on: showProvenance, onToggle: (v) => setShowProvenance(v), locked: reviewMode }} />
      )}

      {/* Document tabs */}
      {!focus && (
        <div className="h-[34px] flex items-end gap-1 px-2 md:px-4 pt-1.5 bg-[#f1f3f4] border-b border-gray-200 overflow-x-auto overflow-y-hidden no-scrollbar flex-shrink-0" role="tablist" aria-label={t("editor.tabs.label")}>
          <button role="tab" aria-selected={activeTab === SUBMISSION} onClick={() => switchTab(SUBMISSION)} className={`doc-tab submission ${activeTab === SUBMISSION ? "active" : ""}`} title={t("editor.tabs.submissionHint")}>
            <FileCheck className="w-4 h-4 text-brand-600 flex-shrink-0" />
            <span className="truncate">{finalSubmission}</span>
            <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />
          </button>
          {tabs.map((tb) => (
            <div key={tb.id} className="relative flex-shrink-0">
              <button role="tab" aria-selected={activeTab === tb.id} onClick={() => switchTab(tb.id)} onDoubleClick={() => canEdit && setTabMenu(`rename:${tb.id}`)} className={`doc-tab ${activeTab === tb.id ? "active" : ""} ${activeTab === tb.id && canEdit ? "pr-7" : ""}`}>
                <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {tabMenu === `rename:${tb.id}` ? (
                  <input
                    autoFocus
                    defaultValue={tb.title}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== tb.title) renameTab(tb.id, v.slice(0, 80)); setTabMenu(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setTabMenu(null); }}
                    className="text-[13px] bg-white border border-brand-300 rounded px-1 w-36 focus:outline-none"
                    aria-label={t("editor.tabs.name")}
                  />
                ) : (
                  <span className="truncate">{tb.title}</span>
                )}
              </button>
              {activeTab === tb.id && canEdit && tabMenu !== `rename:${tb.id}` && (
                <button onClick={() => setTabMenu(tabMenu === tb.id ? null : tb.id)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-500" aria-label={t("editor.tabs.options", { title: tb.title })}>
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              )}
              {tabMenu === tb.id && (
                <div className="docs-menu !top-full !left-auto right-0 !min-w-[230px]" onMouseLeave={() => setTabMenu(null)}>
                  <button onClick={() => setTabMenu(`rename:${tb.id}`)}>{t("editor.rename")}</button>
                  <button onClick={() => { setTabMenu(null); duplicateTab(tb.id); }}>{t("editor.tabs.duplicate")}</button>
                  <button onClick={() => { setTabMenu(null); setConfirmPromote(tb.id); }}>{t("editor.tabs.useAsSubmission", { finalSubmission })}</button>
                  <div className="sep" />
                  <button onClick={() => { setTabMenu(null); setConfirmDelete(tb.id); }} className="!text-red-600">{t("editor.tabs.delete")}</button>
                </div>
              )}
            </div>
          ))}
          {canEdit && tabs.length < 20 && (
            <button onClick={() => addTab()} className="flex items-center px-2 py-1.5 mb-0.5 rounded-lg text-gray-500 hover:bg-white/70 flex-shrink-0" aria-label={t("editor.tabs.new")} title={t("editor.tabs.new")}>
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <main className={`flex-1 overflow-auto ${workspaceClass}`} onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus("end"); }}>
          <div className="px-0 md:px-4 min-h-full">
            <div className="docs-page" ref={sheetRef}>
              <EditorContent editor={editor} spellCheck={spellcheck} />
              {showProvenance && !isMobile && <ProvenanceGutter editor={editor} sheetRef={sheetRef} interactions={interactions} alwaysAnnotate={reviewMode} zoom={zoom / 100} />}
              <BubbleMenu editor={editor} tippyOptions={{ duration: 120, placement: "bottom" }} shouldShow={({ state }) => !state.selection.empty && !isMobile}>
                <div className="bubble-menu" role="toolbar" aria-label={t("editor.bubble.label")}>
                  {canEdit && (
                    <>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={`bm-btn font-bold ${editor.isActive("bold") ? "active" : ""}`} aria-label={t("editor.fmt.bold")}>B</button>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={`bm-btn italic font-serif text-[15px] ${editor.isActive("italic") ? "active" : ""}`} aria-label={t("editor.fmt.italic")}>I</button>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()} className={`bm-btn underline ${editor.isActive("underline") ? "active" : ""}`} aria-label={t("editor.fmt.underline")}>U</button>
                      <span className="bm-sep" />
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => openCite()} className="bm-btn !px-[9px]"><BookMarked className="w-[13px] h-[13px]" />{t("editor.cite")}</button>
                    </>
                  )}
                  <button onMouseDown={(e) => e.preventDefault()} onClick={startComment} className="bm-btn !px-[9px]"><MessageSquarePlus className="w-[13px] h-[13px]" />{t("editor.comment")}</button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSidebar("cite")} className="bm-btn !px-[9px]" title={t("editor.bubble.supportTitle")}><SearchIcon className="w-[13px] h-[13px]" />{t("editor.support")}</button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSidebar("evidence")} className="bm-btn !px-[9px]" title={t("editor.bubble.evidenceTitle")}><Scale className="w-[13px] h-[13px]" />{t("editor.evidence")}</button>
                  {isOwner && <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSidebar("ai")} className="bm-btn !px-2.5 bg-brand-600 hover:bg-brand-700 font-semibold"><Bot className="w-[13px] h-[13px]" />{t("editor.askAi")}</button>}
                </div>
              </BubbleMenu>
            </div>
          </div>
        </main>
        {sidebar !== "none" && !focus && !isMobile && (
          <aside className="relative border-l border-gray-200 bg-white flex flex-col flex-shrink-0 min-h-0" style={{ width: panelWidth }}>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t("editor.panel.resize")}
              title={t("editor.panel.resize")}
              onPointerDown={onPanelResizeStart}
              onPointerMove={onPanelResizeMove}
              onPointerUp={onPanelResizeEnd}
              onPointerCancel={onPanelResizeEnd}
              onDoubleClick={() => { setPanelWidth(400); try { localStorage.setItem("assistant_width", "400"); } catch { /* ignore */ } }}
              className="absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize z-10 group"
            >
              <span className="absolute top-0 bottom-0 left-[3px] w-[2px] bg-transparent group-hover:bg-brand-400 transition-colors" />
            </div>
            {sidebarPanel()}
          </aside>
        )}
      </div>

      {/* Session bar (30px) */}
      <SessionBar
        sessionActive={!!sessionId}
        scopes={sessionId ? me?.consent?.scopes || { keystrokes: false, paste: true, aiInteractions: true, tabActivity: false } : null}
        onChange={() => setDialog("consent")}
        isOwner={isOwner}
        reviewMode={reviewMode}
        status={statusLabel(t, thesis.status)}
        advisorName={thesis.professorName && thesis.professorName !== "Unassigned" ? thesis.professorName : undefined}
        words={activeTab === SUBMISSION ? thesis.wordCount : tabWords}
        targetWords={thesis.targetWords}
        pages={!isMobile && pageCount > 0 ? pageCount : Math.max(1, Math.ceil((activeTab === SUBMISSION ? thesis.wordCount : tabWords) / 350))}
        citationStyle={thesis.citationStyle}
        zoom={zoom}
        onWordCount={() => setDialog("wordCount")}
        workingTab={activeTab !== SUBMISSION ? { title: tabs.find((tb) => tb.id === activeTab)?.title || t("editor.untitledTab"), onGoToSubmission: () => switchTab(SUBMISSION) } : null}
      />

      {/* Mobile bottom action bar */}
      {isMobile && (
        <nav className="relative z-[70] flex justify-around border-t border-gray-200 bg-white flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label={t("editor.mobile.navLabel")}>
          {([...(isOwner ? [["ai", <Bot key="a" className="w-5 h-5" />, t("editor.mobile.ai")]] : []), ["comments", <MessageSquare key="c" className="w-5 h-5" />, t("editor.panel.comments")], ["outline", <ListTree key="o" className="w-5 h-5" />, t("editor.panel.outline")], ["integrity", <ShieldCheck key="i" className="w-5 h-5" />, t("glossary.integrity")]] as [SidebarKind, React.ReactNode, string][]).map(([k, icon, label]) => (
            <button key={k} onClick={() => setSidebar((s) => (s === k ? "none" : k))} aria-pressed={sidebar === k} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${sidebar === k ? "text-brand-600" : "text-gray-500"}`}>{icon}{label}</button>
          ))}
          <button onClick={() => setMobileMenu(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-gray-500"><ChevronDown className="w-5 h-5" />{t("common.more")}</button>
        </nav>
      )}
      {/* Mobile bottom sheet: a tap on the backdrop, the close button, Escape or the bottom bar closes it. */}
      {isMobile && sidebar !== "none" && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={panelTitle(sidebar)}>
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setSidebar("none")} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 top-12 bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 flex flex-col animate-slide-up" style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))", top: "max(3rem, env(safe-area-inset-top, 0px))" }}>
            <div className="flex items-center h-9 pl-10 pr-1 flex-shrink-0 border-b border-gray-100">
              <span className="flex-1 flex justify-center"><span className="w-9 h-1 rounded-full bg-gray-300" aria-hidden="true" /></span>
              <button onClick={() => setSidebar("none")} className="w-8 h-8 inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 flex-shrink-0" aria-label={t("editor.mobile.closePanel")}><X className="w-[18px] h-[18px]" /></button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">{sidebarPanel()}</div>
          </div>
        </div>
      )}
      <Modal open={mobileMenu} onClose={() => setMobileMenu(false)} title={thesis.title} size="sm">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {([["save", t("editor.menu.saveNow")], ["saveVersion", t("editor.menu.saveVersion")], ["versions", t("editor.menu.versionHistory")], ["find", t("editor.mobile.find")], ["references", t("editor.panel.citations")], ["dl-docx", t("editor.mobile.dlDocx")], ["dl-md", t("editor.mobile.dlMd")], ["print", t("editor.mobile.print")], ["pageSetup", t("editor.menu.pageSetup")], ["wordCount", t("editor.menu.documentDetails")], ["provenance", showProvenance ? t("editor.mobile.hideProvenance") : t("editor.mobile.showProvenance")], ["share", t("editor.share")], ["submit", t("editor.menu.submit")], ["privacy", t("editor.mobile.privacy")], ["rename", t("editor.rename")], ["shortcuts", t("editor.mobile.shortcuts")]] as [MenuAction, string][]).map(([a, l]) => (
            <button key={a} onClick={() => { setMobileMenu(false); onAction(a); }} className="p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-left">{l}</button>
          ))}
        </div>
      </Modal>

      {/* Dialogs */}
      <LinkDialog open={dialog === "link"} onClose={() => setDialog(null)} initial={linkInitial} onSubmit={(url) => editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()} onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} />
      <ImageDialog open={dialog === "image"} onClose={() => setDialog(null)} onSubmit={(src, alt) => editor.chain().focus().setImage({ src, alt }).run()} />
      <TableDialog open={dialog === "table"} onClose={() => setDialog(null)} onSubmit={(rows, cols, header) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run()} />
      <PageSetupDialog open={dialog === "pageSetup"} onClose={() => setDialog(null)} value={ws} onSubmit={(v) => (canEdit ? updateThesis({ pageSetup: v }) : setThesis((t) => ({ ...t, pageSetup: v })))} />
      <WordCountDialog open={dialog === "wordCount"} onClose={() => setDialog(null)} stats={stats} thesis={thesis} />
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} thesis={thesis} />
      <TextPromptDialog open={dialog === "rename"} onClose={() => setDialog(null)} title={t("editor.dialog.renameTitle")} initial={thesis.title} onSubmit={(title) => updateThesis({ title }, t("editor.toast.renamed"))} submitLabel={t("editor.rename")} />
      <TextPromptDialog open={dialog === "saveVersion"} onClose={() => setDialog(null)} title={t("editor.dialog.versionTitle")} label={t("editor.dialog.versionPlaceholder")} onSubmit={async (label) => { await saveNow(); await api(`/api/theses/${thesisId}/versions`, { method: "POST", json: { label } }).catch(() => {}); notify(t("editor.toast.versionSaved"), "success"); loadVersions(); }} submitLabel={t("editor.dialog.versionSubmit")} />
      <ConfirmDialog open={dialog === "submit"} onClose={() => setDialog(null)} title={t("editor.dialog.submitTitle")} body={richText(t("editor.dialog.submitBody"), { finalSubmission: <strong>{finalSubmission}</strong>, advisor: <strong>{thesis.professorName}</strong> })} confirmLabel={t("editor.dialog.submitConfirm")} onConfirm={async () => { await saveNow(); updateThesis({ status: "under_review" }, t("editor.toast.submitted")); }} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} />
      <ConfirmDialog open={!!confirmPromote} onClose={() => setConfirmPromote(null)} title={t("editor.dialog.promoteTitle", { finalSubmission })} confirmLabel={t("editor.tabs.useAsSubmission", { finalSubmission })} body={t("editor.dialog.promoteBody", { title: tabs.find((tb) => tb.id === confirmPromote)?.title || "", finalSubmission })} onConfirm={() => confirmPromote && promoteTab(confirmPromote)} />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t("editor.dialog.deleteTitle")} danger confirmLabel={t("editor.tabs.delete")} body={t("editor.dialog.deleteBody", { title: tabs.find((tb) => tb.id === confirmDelete)?.title || "", finalSubmission })} onConfirm={() => confirmDelete && deleteTab(confirmDelete)} />
      <CitationDialog open={!!citeMode} onClose={() => setCiteMode(null)} selection={citeText} thesis={thesis} sessionId={sessionId} insertMode={citeMode || "cursor"} onInsert={(c) => insertCitation(c, citeMode || "cursor")} />
      <Modal open={dialog === "about"} onClose={() => setDialog(null)} title={t("editor.dialog.aboutTitle")} size="sm" footer={<button onClick={() => setDialog(null)} className="btn-primary !py-2 !px-4 text-sm">{t("common.close")}</button>}>
        <p className="text-sm text-gray-600">{t("editor.dialog.aboutBody")}</p>
      </Modal>
      <VersionPreviewDialog open={!!preview} onClose={() => setPreview(null)} html={preview?.html || ""} label={preview?.label || ""} canRestore={canEdit} onRestore={async () => { if (!preview) return; const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}/versions/${preview.id}`, { method: "POST" }).catch(() => null); if (d) { restoreSubmission(d.thesis); loadVersions(); } }} />
      <PasteAttributionDialog open={!!paste} words={paste?.words || 0} matched={paste?.matched || null} onDecide={decidePaste} onDismiss={() => decidePaste("none")} />
      {me?.policy && (
        <ConsentModal open={dialog === "consent"} onClose={() => setDialog(null)} policy={me.policy} existing={me.consent} thesisId={thesisId} onGranted={async () => { await refreshMe(); if (!monitorRef.current) startSession(); else notify(t("editor.toast.monitoringUpdated"), "success"); }} />
      )}
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}
