"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BubbleMenu, EditorContent, useEditor, type Editor } from "@tiptap/react";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { DOMSerializer } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import LinkExt from "@tiptap/extension-link";
import { IMAGE_EDIT_META, imageFilesOf, insertImage, insertImageFiles, patchImage, ResizableImage } from "./image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import CharacterCount from "@tiptap/extension-character-count";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Typography from "@tiptap/extension-typography";
import { ArrowLeft, BookMarked, Bot, ChevronDown, CloudOff, ListTree, MessageSquare, MessageSquarePlus, MoreVertical, Plus, Scale, Search as SearchIcon, ShieldCheck, X } from "lucide-react";
import { CitationMark, CitedPassage, CommentMark, FontSize, Indent, LineHeight, PageBreak, Provenance, ProvenanceStats, Search } from "./extensions";
import { Pagination } from "./pagination";
import { TableExtras } from "./tableExtras";
import { TextTools } from "./textTools";
import { anchorHref, Bookmark, findAnchorPos, HeadingAnchors, listAnchors, type AnchorItem } from "./anchors";
import { Captions, Footnote, FootnoteRef, Footnotes, Toc } from "./thesisBlocks";
import { ChartNode, insertDiagram } from "./chart";
import { cleanLatex, equationKey, insertEquation, MathBlock, MathInline, type EquationValue } from "./math";
import { insertArtifactCommand } from "./insertArtifact";
import { htmlFigureStats } from "./figureStats";
import { hintPlaceholder, TemplateHints } from "./templateHints";
import EquationDialog from "./forms/EquationDialog";
import DiagramDialog from "./forms/DiagramDialog";
import { TableBubble, TableContextMenu, runTableAction } from "./TableMenu";
import { SpecialCharsDialog } from "./SpecialCharsDialog";
import { FirstPageHeader, PrintHeaderFooter } from "./PageHeaderFooter";
import CitationDialog, { CitationInsert } from "./CitationDialog";
import Toolbar from "./Toolbar";
import { MenuAction, MenuOverflow } from "./MenuBar";
import { TypographyRow, TypographyToggle } from "./BubbleTypography";
import SessionBar from "./SessionBar";
import ProvenanceGutter from "./ProvenanceGutter";
import { BriefPanel, CommentsPanel, FindPanel, IntegrityLedger, OutlinePanel, useNoticeLabel, VersionsPanel } from "./Sidebars";
import DocumentTabs from "./DocumentTabs";
import { AiPasteDialog, ConfirmDialog, ImageDialog, LinkDialog, PageSetupDialog, PasteAttributionDialog, PasteDecision, ShareDialog, ShortcutsDialog, SubmitDialog, TableDialog, TextPromptDialog, VersionPreviewDialog, WordCountDialog, type AiPasteCost, type PasteMatchInfo, type TeacherRole } from "./Dialogs";
import { CommentItem, FlagItem, formatReference, formatTimeAgo, ieeeOrderKey, inTextCitation, IntegrityBreakdown, IntegrityFix, InteractionLite, Reference, renumberedIeeeChip, renumberIeeeHtml, SidebarKind, statusLabel, ThesisDoc, ThesisTab, VersionItem } from "./types";
import AssistantPanel, { type InsertArtifactHandler, type InsertMeta } from "../ai/AssistantPanel";
import { LanguageReview } from "./language/languageReview";
import { LanguageReviewPanel } from "./language/LanguageReviewPanel";
import ReviewerPanel from "./reviewer/ReviewerPanel";
import CiteVerifiedPanel from "./citations/CiteVerifiedPanel";
import ProcessPanel from "./process/ProcessPanel";
import { recordSnapshot } from "./process/useSnapshots";
import LibraryPanel from "./sources/LibraryPanel";
import { referenceFromSource, type LibrarySource } from "./sources/SourcesPanel";
import { newReferenceId, normDoi, referenceForSource } from "./sources/match";
import { citationCounts } from "@/lib/sources/cited";
import EvidencePanel from "./evidence/EvidencePanel";
import ConsentModal from "../ConsentModal";
import { DeadlineDialog, IntegrityPill, KindIcon, Modal, Toast } from "../ui";
import StudentOnboarding, { type OnboardingPhase } from "../onboarding/StudentOnboarding";
import { readOnboardingDone } from "@/lib/onboarding";
import { useUser, type Consent } from "../useUser";
import { api, ApiError, countWordsInText } from "@/lib/client";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n";
import { translate, type Translate } from "@/lib/i18n/dictionary";
import { acquireSessionMonitor, releaseSessionMonitor, SessionMonitor, type MonitorFlag, type MonitorHandlers, type MonitorMetrics } from "@/lib/monitor";
import { downloadBlob, htmlToDocx, htmlToMarkdown, htmlToText, safeFileName, standaloneHtml } from "@/lib/export";
import { computeProvenance, countWords, measureContent } from "@/lib/countable";
import { isHandedIn, isLockedStatus } from "@/lib/paperSections";
import { paperKind } from "@/lib/papers/kinds";
import { teacherRoleKey } from "@/lib/papers/templates";

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
/** Selected nodes that bring their own toolbar: the text bubble menu stays closed on them. */
const NODE_TOOLBARS = ["image", "chart", "math", "mathBlock"];
const SUBMISSION = "submission";
/** The three SidebarKinds of the Sources & references panel (one per tab). */
const isLibraryKind = (k: SidebarKind) => k === "references" || k === "sources" || k === "library";
/** Panel names for the mobile bottom sheet's label; the other kinds use `editor.panel.<kind>`. */
const PANEL_TITLES: Partial<Record<SidebarKind, string>> = {
  ai: "glossary.aiAssistant",
  integrity: "glossary.integrityLedger",
  references: "glossary.sourcesReferences",
  sources: "glossary.sourcesReferences",
  library: "glossary.sourcesReferences",
  cite: "panelsReview.cite.title",
  evidence: "panelsResearch.evidence.title",
  reviewer: "panelsReview.reviewer.title",
  language: "panelsReview.language.title",
  process: "panelsResearch.process.title",
  brief: "glossary.brief",
};
const norm = (t: string) => t.replace(/\s+/g, " ").trim();
/** Clipboard HTML that holds a figure of the editor (chart or diagram): it wins over image files on the clipboard. */
const FIGURE_HTML_RE = /<figure\b[^>]*\bdata-chart\b/i;
/** Cheap test before parsing: HTML that may carry AI-assisted text, figures or equations of Thesisfic. */
const MAY_CARRY_AI_RE = /data-provenance|data-chart|data-math/i;
/** A drop's or paste's HTML read as the server reads saved HTML: AI words, all words, AI figures and AI equations. */
function aiPasteCostOf(html: string): (AiPasteCost & { provider?: string; interactionId?: string }) | null {
  if (!html || !MAY_CARRY_AI_RE.test(html)) return null;
  const stats = htmlFigureStats(html);
  const cost = { aiWords: computeProvenance(html).ai, totalWords: countWords(html), figures: stats.figures.ai, equations: stats.equations.ai };
  if (!cost.aiWords && !cost.figures && !cost.equations) return null;
  // The first AI mark or figure names the provider and the AI log entry of the ai_insert event.
  const attr = (name: string) => html.match(new RegExp(`\\b${name}="([^"<>]{1,120})"`))?.[1];
  return { ...cost, provider: attr("data-provider"), interactionId: attr("data-interaction") };
}
/** What a cut or a paste adds in AI content, as a comparable key ("" = nothing AI). */
const aiCostKey = (c: AiPasteCost | null) => (c ? `${c.aiWords}/${c.totalWords}/${c.figures}/${c.equations}` : "");

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
  if (!data || loading || !user) return <div className="min-h-screen bg-workspace flex items-center justify-center text-gray-400 text-sm">{t("editor.loadingDocument")}</div>;
  return <DocsEditorInner initial={data} thesisId={thesisId} userId={user.id} userRole={user.role} reviewMode={reviewMode} onboarded={!!user.onboardedAt} />;
}

function DocsEditorInner({ initial, thesisId, userId, userRole, reviewMode, onboarded }: { initial: LoadResponse; thesisId: string; userId: string; userRole: string; reviewMode: boolean; onboarded: boolean }) {
  const router = useRouter();
  // `t` is stable and always reads the current locale, so closures captured by the editor never go stale.
  const tLive = useT();
  const tRef = useRef<Translate>(tLive);
  tRef.current = tLive;
  const t = useCallback<Translate>((key, vars) => tRef.current(key, vars), []);
  const fmt = useFormat();
  const { locale } = useLocale();
  const finalSubmission = t("glossary.finalSubmission");
  const aiAssisted = t("glossary.aiAssisted");
  const { me, refresh: refreshMe } = useUser();
  const [thesis, setThesis] = useState<ThesisDoc>(initial.thesis);
  const [comments, setComments] = useState<CommentItem[]>(initial.comments);
  const [flags, setFlags] = useState<FlagItem[]>(initial.flags);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const isOwner = thesis.studentId === userId;
  /** Set when a save was refused because the paper became approved or submitted meanwhile (409 locked). */
  const [lockedLocal, setLockedLocal] = useState(false);
  const canEdit = isOwner && !isLockedStatus(thesis.status) && !lockedLocal;
  const paper = { kind: paperKind(thesis), professorId: thesis.professorId };
  /** Advisor (thesis kinds, with the fr/es doctoral variant) / Teacher / none: `papers.teacher.<role>`. */
  const teacherRole = teacherRoleKey(paper).split(".").pop() as TeacherRole;
  /**
   * Why the due date, word target and citation style cannot change here: a paper of an assignment takes them from
   * the brief, and a handed-in or locked paper keeps them (the server ignores new values then).
   */
  const handedIn = isHandedIn({ status: thesis.status, submittedAt: thesis.submittedAt } as Parameters<typeof isHandedIn>[0]);
  const settingsLock = !isOwner ? null : thesis.assignmentId ? t("editor.settings.setByTeacher") : handedIn || isLockedStatus(thesis.status) ? t("editor.settings.fixedHandedIn") : null;

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
  useEffect(() => {
    const dom = editorRef.current?.view.dom as HTMLElement | undefined;
    if (dom) dom.spellcheck = spellcheck;
  }, [spellcheck]);
  const [focus, setFocus] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [bubbleTypo, setBubbleTypo] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingComment, setPendingComment] = useState<{ anchorId: string; quote: string } | null>(null);
  const [confirmPromote, setConfirmPromote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "link" | "image" | "table" | "pageSetup" | "wordCount" | "share" | "rename" | "saveVersion" | "submit" | "shortcuts" | "about" | "consent" | "specialChars" | "bookmark" | "deadline">(null);
  const [anchors, setAnchors] = useState<AnchorItem[]>([]);
  const [tableMenuAt, setTableMenuAt] = useState<{ x: number; y: number } | null>(null);
  const goToAnchorRef = useRef<(href: string) => void>(() => {});
  const onActionRef = useRef<(a: MenuAction) => void>(() => {});
  /** Position of the image being replaced while the image dialog is open (null = inserting a new one). */
  const [imageReplacePos, setImageReplacePos] = useState<number | null>(null);
  const [linkInitial, setLinkInitial] = useState("");
  /**
   * A long paste waiting for the student's declaration. With `range`, the text is already in the page (the unmarked
   * rest of a confirmed AI paste): the declaration marks that range instead of inserting.
   */
  const [paste, setPaste] = useState<{ words: number; text: string; html: string; matched: PasteMatchInfo | null; fingerprint: string | null; range?: { from: number; to: number } } | null>(null);
  /** A paste or drop into the Final submission that carries AI content: its cost card is open, nothing is pasted yet. */
  const [aiPaste, setAiPaste] = useState<{ html: string; text: string; cost: NonNullable<ReturnType<typeof aiPasteCostOf>>; pos: number | null } | null>(null);
  /** True while the confirmed AI paste runs through ProseMirror's own paste path (our handler lets it through). */
  const pasteBypass = useRef(false);
  /** Insert › Equation / Insert › Diagram › … forms (D22: what the student makes is Written). */
  const [insertForm, setInsertForm] = useState<null | { kind: "equation" } | { kind: "diagram"; figure: "gantt" | "prisma" | "conceptMap" }>(null);
  /** The paper became approved or submitted while open (409 locked): said once, then the editor is read-only. */
  const lockedNotified = useRef(false);
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
  const getTabHtml = useCallback((id: string) => contentsRef.current[id] ?? "", []);
  const [tabWords, setTabWords] = useState(0);
  const activeTabRef = useRef<string>(SUBMISSION);
  const tabsRef = useRef<ThesisTab[]>(tabs);
  tabsRef.current = tabs;
  const contentsRef = useRef<Record<string, string>>({ [SUBMISSION]: initial.thesis.content, ...Object.fromEntries((initial.thesis.tabs || []).map((t) => [t.id, t.content])) });
  const dirtyKeys = useRef<Set<string>>(new Set());
  const tabsMetaDirty = useRef(false);
  const internalCopy = useRef<string>("");
  /**
   * Where the last copy or cut inside the editor came from: a cut and paste inside the Final submission is a move, once
   * (`cut` is cleared by that paste), and only for a paste carrying the same AI content as the cut (`cost`).
   */
  const internalCopyFrom = useRef<{ tab: string; cut: boolean; cost: string }>({ tab: "", cut: false, cost: "" });

  // ---------- citations ----------
  const [citeMode, setCiteMode] = useState<null | "selection" | "cursor" | "library">(null);
  const citeRange = useRef<{ from: number; to: number }>({ from: 0, to: 0 });
  const [citeText, setCiteText] = useState("");
  /** Fields the citation dialog opens with ("Cite" on a source whose entry lacks authors or year). */
  const [citePrefill, setCitePrefill] = useState<Reference | null>(null);
  const policy = initial.policy;

  const notify = useCallback((message: string, kind: "info" | "success" | "error" = "info") => setToast({ message, kind }), []);

  // ---------- sources & references ----------
  /** Sources linked to this thesis (each lives in the student's library); null until the first answer. */
  const [sources, setSources] = useState<LibrarySource[] | null>(null);
  /**
   * The first read failed: the list stays unknown (null, so the session bar shows no count) and the Sources tab says
   * so with a retry, instead of "no sources yet". A later refresh that fails keeps the last list.
   */
  const [sourcesFailed, setSourcesFailed] = useState(false);
  const sourcesLoaded = useRef(false);
  const reloadSources = useCallback(async () => {
    try {
      const d = await api<{ sources: LibrarySource[] }>(`/api/theses/${thesisId}/sources`);
      sourcesLoaded.current = true;
      setSources(d.sources);
      setSourcesFailed(false);
    } catch {
      if (!sourcesLoaded.current) setSourcesFailed(true);
    }
  }, [thesisId]);
  const retrySources = useCallback(() => {
    setSourcesFailed(false);
    reloadSources();
  }, [reloadSources]);
  useEffect(() => {
    reloadSources();
  }, [reloadSources]);
  const updateSources = useCallback((update: (list: LibrarySource[]) => LibrarySource[]) => setSources((s) => update(s || [])), []);
  /** Tab Find support opens on: the References tab's "Check references" link opens the Reference check. */
  const [citeTab, setCiteTab] = useState<"find" | "check">("find");

  /**
   * The reference list as last written or read. Writes made in quick succession build on each other instead of on a
   * stale render, and the answers to other saves never replace it (only an explicit refresh or a reference check does).
   */
  const referencesRef = useRef<Reference[]>(initial.thesis.references || []);
  /** >0 while a reference-list write is on its way: a refresh from the server waits, so it never undoes the write. */
  const refsWrites = useRef(0);
  /** Bumped on every local change of the list: a refresh that started before it is dropped. */
  const refsEpoch = useRef(0);
  useEffect(() => {
    referencesRef.current = thesis.references || [];
  }, [thesis.references]);
  const applyReferences = useCallback((refs: Reference[]) => {
    referencesRef.current = refs;
    refsEpoch.current++;
    setThesis((x) => ({ ...x, references: refs }));
  }, []);
  /** Replaces the thesis's reference list (the server syncs it into the student's library; removed entries stay there). */
  const saveReferences = useCallback(
    async (refs: Reference[], successMsg?: string) => {
      applyReferences(refs);
      refsWrites.current++;
      try {
        await api(`/api/theses/${thesisId}`, { method: "PUT", json: { references: refs } });
        if (successMsg) notify(successMsg, "success");
      } catch (e) {
        notify((e as Error).message, "error");
      } finally {
        refsWrites.current--;
      }
    },
    [thesisId, notify, applyReferences]
  );
  /**
   * Re-reads thesis.references from the server: choices made on the library page (another browser tab) or in the
   * "Your library" tab are not overwritten later by a stale array. Skipped while a local write is on its way, unless
   * `afterWrites`, which first waits (up to 5 s) for those writes to land.
   */
  const refreshReferences = useCallback(
    async (afterWrites = false) => {
      if (refsWrites.current > 0) {
        if (!afterWrites) return;
        for (let i = 0; i < 50 && refsWrites.current > 0; i++) await new Promise((r) => setTimeout(r, 100));
        if (refsWrites.current > 0) return;
      }
      const epoch = refsEpoch.current;
      try {
        const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}`);
        if (refsWrites.current > 0 || epoch !== refsEpoch.current) return;
        applyReferences(d.thesis.references || []);
      } catch {
        /* keep the local list */
      }
    },
    [thesisId, applyReferences]
  );
  // Back from the library page (or any other tab): the list may have changed there.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refreshReferences();
      reloadSources();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshReferences, reloadSources]);

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

  // First visit to the editor: the welcome modal, then the tour. Students only, never in review mode. The automatic
  // start waits for a desktop width; a link that ends in ?tour=1 (for sharing the tutorial, even with an account that
  // has already seen it) opens it on any screen, and narrow screens skip the coachmarks (their anchors are hidden).
  // Replayable from ⋯ → Help → Show the tour again.
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>("off");
  const tourLinkRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (reviewMode || !isOwner || userRole !== "student") return;
    if (tourLinkRef.current === null) {
      const url = new URL(window.location.href);
      tourLinkRef.current = url.searchParams.get("tour") === "1";
      if (tourLinkRef.current) {
        url.searchParams.delete("tour");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    }
    const forced = tourLinkRef.current;
    if (!forced && onboarded) return;
    if (!forced && (window.innerWidth < 1024 || readOnboardingDone())) return;
    const id = setTimeout(() => setOnboardingPhase("intro"), 700);
    return () => clearTimeout(id);
  }, [reviewMode, isOwner, userRole, onboarded]);

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

  const imageFileError = useCallback(
    (reason: "type" | "size" | "read", name: string) => notify(t(reason === "size" ? "editor.image.tooLargeNamed" : reason === "type" ? "editor.image.notAnImage" : "editor.image.readError", { name }), "error"),
    [notify, t]
  );

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
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      LinkExt.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      ResizableImage.configure({ inline: false, allowBase64: true, onReplace: (pos: number) => { setImageReplacePos(pos); setDialog("image"); } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      // Template hints and the empty-document placeholder, in the interface language (read from tRef when drawn).
      TemplateHints,
      hintPlaceholder(() => tRef.current),
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
      TableExtras,
      TextTools,
      Bookmark,
      HeadingAnchors,
      FootnoteRef,
      Footnote,
      Footnotes,
      Captions,
      Toc.configure({ labels: { title: t("editor.doc.toc"), empty: t("editor.doc.noHeadings") } }),
      // Figures (copilot charts and diagrams, the student's own diagrams) and equations (docs/papers.md §9).
      ChartNode.configure({ onLimit: (max: number) => notify(t("figures.chart.limit", { max }), "info") }),
      MathInline,
      MathBlock,
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
        // Links open with Ctrl/Cmd+click (always in read-only review); `#…` links jump to a heading or bookmark.
        const link = (event.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
        if (link && (!canEdit || event.ctrlKey || event.metaKey)) {
          const href = link.getAttribute("href") || "";
          if (href.startsWith("#")) goToAnchorRef.current(href);
          else window.open(link.href, "_blank", "noopener,noreferrer");
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const target = event.target as HTMLElement;
          if (!canEdit || !target.closest?.("td, th")) return false;
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at && !editorRef.current?.isActive("table")) editorRef.current?.commands.setTextSelection(at.pos);
          event.preventDefault();
          setTableMenuAt({ x: event.clientX, y: event.clientY });
          return true;
        },
        copy: (view) => {
          const { from, to } = view.state.selection;
          internalCopy.current = norm(view.state.doc.textBetween(from, to, " "));
          internalCopyFrom.current = { tab: activeTabRef.current, cut: false, cost: "" };
          return false;
        },
        cut: (view) => {
          const { from, to } = view.state.selection;
          internalCopy.current = norm(view.state.doc.textBetween(from, to, " "));
          // The AI content of what is cut, counted as the paste will count the clipboard's HTML.
          let cost = "";
          try {
            const holder = document.createElement("div");
            holder.appendChild(DOMSerializer.fromSchema(view.state.schema).serializeFragment(view.state.selection.content().content));
            cost = aiCostKey(aiPasteCostOf(holder.innerHTML));
          } catch {
            cost = "?";
          }
          internalCopyFrom.current = { tab: activeTabRef.current, cut: true, cost };
          return false;
        },
      },
      handleDrop: (view, event, _slice, moved) => {
        // Moving something inside the page is left to ProseMirror (marks and figure origins travel with it).
        if (moved) return false;
        const dt = (event as DragEvent).dataTransfer;
        const html = dt?.getData("text/html") || "";
        const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY });
        // AI content dropped into the Final submission (from another window of this paper): its cost card first.
        const cost = canEdit && activeTabRef.current === SUBMISSION ? aiPasteCostOf(html) : null;
        if (cost) {
          event.preventDefault();
          setAiPaste({ html, text: dt?.getData("text/plain") || "", cost, pos: at?.pos ?? null });
          return true;
        }
        // A figure of the editor (chart or diagram) comes with a picture of itself: the figure wins, never the picture.
        if (FIGURE_HTML_RE.test(html)) return false;
        // Image files dropped from the desktop: inserted where they land.
        const files = imageFilesOf(dt?.files);
        if (!files.length) return false;
        event.preventDefault();
        if (!canEdit) return true;
        if (editorRef.current) insertImageFiles(editorRef.current, files, { pos: at?.pos, onError: imageFileError });
        return true;
      },
      handlePaste: (view, event) => {
        // The confirmed paste of AI content (after its cost card) goes through ProseMirror's own paste path.
        if (pasteBypass.current) return false;
        if (!canEdit) return false;
        const text = event.clipboardData?.getData("text/plain") || "";
        const html = event.clipboardData?.getData("text/html") || "";
        // AI-assisted text, figures or equations pasted into the Final submission (e.g. from Research notes): the
        // cost card comes first, with the same numbers as the assistant's, and nothing is pasted until it is confirmed
        // (principle 5). A cut and paste inside the Final submission is a move and needs no card.
        if (activeTabRef.current === SUBMISSION) {
          const pasteCost = aiPasteCostOf(html);
          const cut = internalCopyFrom.current;
          const move = cut.cut && cut.tab === SUBMISSION && norm(text) === internalCopy.current && aiCostKey(pasteCost) === cut.cost;
          // A cut moves once: pasting it a second time adds the content again, so it gets its card like any copy.
          if (move) cut.cut = false;
          const cost = move ? null : pasteCost;
          if (cost) {
            event.preventDefault();
            setAiPaste({ html, text, cost, pos: null });
            return true;
          }
        }
        // Pasted pictures (screenshots, copied images): no provenance dialog and no words, the image is simply inserted.
        // Word and Excel also put a picture of the selection next to the text: with text on the clipboard, the text path
        // wins, and a figure of the editor (its HTML holds `figure[data-chart]`) always wins over its own picture.
        const pastedImages = text.trim() || FIGURE_HTML_RE.test(html) ? [] : imageFilesOf(event.clipboardData?.files);
        if (pastedImages.length) {
          event.preventDefault();
          if (editorRef.current) insertImageFiles(editorRef.current, pastedImages, { onError: imageFileError });
          return true;
        }
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
        if (event.key === "F3" && event.shiftKey && canEdit) { event.preventDefault(); onActionRef.current("caseCycle"); return true; }
        if (!mod) return false;
        if (event.code === "KeyB" && event.altKey && canEdit) { event.preventDefault(); onActionRef.current("bookmark"); return true; }
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
      const words = countWordsInText(ed.getText({ blockSeparator: " " }));
      setTabWords(words);
      const isPaste = transaction.getMeta("paste") || transaction.getMeta("uiEvent") === "paste";
      const charDelta = chars - lastCounts.current.chars;
      // Typing is counted only for what the student types: not pastes, not editor commands (insertions, citations,
      // declarations) and not a single transaction that adds more text than any keystroke or IME composition can.
      const isTyping = !isPaste && !transaction.getMeta("ai-insert") && !transaction.getMeta(IMAGE_EDIT_META) && programmaticDepth.current === 0 && charDelta <= 40;
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
    lastCounts.current = { chars: editor.storage.characterCount.characters(), words: countWordsInText(editor.getText({ blockSeparator: " " })) };
    setTabWords(lastCounts.current.words);
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(canEdit, false);
  }, [editor, canEdit]);

  // Template hints and the empty-page placeholder are drawn in the interface language: redraw them when it changes.
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta("addToHistory", false));
  }, [locale]);

  // ---------- provenance (live, client-side) ----------
  const provTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleProvenance = (ed: Editor) => {
    if (provTimer.current) clearTimeout(provTimer.current);
    provTimer.current = setTimeout(() => {
      if (ed.isDestroyed) return;
      // The HTML the server stores, counted with the server's own functions (countable.ts): the live words, AI and
      // pasted shares, figures and equations equal the saved ones by construction (a word split by bold inside an AI
      // mark counts once, inline equations add no word, the AI-use declaration is left out), so the bar never flickers.
      const m = measureContent(ed.getHTML());
      setThesis((t) => ({ ...t, wordCount: m.wordCount, provenance: m.provenance, figures: { total: m.figures.total, ai: m.figures.ai }, equations: m.equations }));
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
        const res = await api<{ thesis: ThesisDoc; integrityBreakdown?: IntegrityBreakdown; flags?: FlagItem[]; resolvedFlagIds?: string[] }>(`/api/theses/${thesisId}`, { method: "PUT", json: payload });
        dirtyRef.current = false;
        // The reference list is not part of this save: the local one (maybe written since) stays.
        setThesis((t) => ({ ...t, ...res.thesis, content: t.content, references: t.references }));
        setLastSaved(new Date().toISOString());
        setSaveState("saved");
        // The saved document is what the server scores: the pill and the ledger update together from this answer.
        applyMetrics({ integrityScore: res.thesis.integrityScore, aiUsagePercent: res.thesis.aiUsagePercent, integrityBreakdown: res.integrityBreakdown });
        // Notices the server closed with this save (cause gone: share under the limit, paste attributed) close here too.
        if (res.resolvedFlagIds?.length) {
          const done = res.resolvedFlagIds;
          setFlags((prev) => prev.map((f) => (done.includes(f.id) && !f.resolved ? { ...f, resolved: true, resolvedAt: new Date().toISOString() } : f)));
        }
        if (res.flags?.length) {
          const fresh = res.flags;
          setFlags((prev) => [...fresh.filter((f) => !prev.some((p) => p.id === f.id)), ...prev]);
          notify(t("editor.toast.newNotice", { notice: noticeLabel(fresh[0].type) }), "error");
        }
        // Process record: a hash-chained snapshot of the tab that was saved (throttled client- and server-side).
        const tabId = activeTabRef.current;
        recordSnapshot(thesisId, { tabId, html: contentsRef.current[tabId] || "", wordCount: countWordsInText(ed.getText()), sessionId: sessionId || undefined });
      } catch (e) {
        // Approved or submitted meanwhile (by the teacher, in another window): the paper is frozen, read-only from now on.
        if (e instanceof ApiError && e.code === "locked") return onLockedRef.current();
        dirty.forEach((k) => dirtyKeys.current.add(k));
        if (metaDirty) tabsMetaDirty.current = true;
        setSaveState("error");
        notify(e instanceof ApiError && e.status === 413 ? t("editor.toast.tooLarge") : t("editor.toast.saveFailed", { message: (e as Error).message }), "error");
      }
    },
    [canEdit, thesisId, sessionId, notify, applyMetrics, noticeLabel, t]
  );
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  const onLockedRef = useRef<() => void>(() => {});

  // ---------- tab operations ----------
  const loadIntoEditor = useCallback((html: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.commands.setContent(html || "<p></p>", false);
    // fresh state so undo never crosses into another tab
    const st = ed.state;
    ed.view.updateState(EditorState.create({ doc: st.doc, plugins: st.plugins, schema: st.schema }));
    lastCounts.current = { chars: ed.storage.characterCount.characters(), words: countWordsInText(ed.getText({ blockSeparator: " " })) };
    setTabWords(lastCounts.current.words);
    setSelectionText("");
  }, []);

  /**
   * 409 locked: the paper was approved or submitted while open. The editor turns read-only, reloads what the server
   * holds (changes since the last save cannot be kept) and says so once.
   */
  const handleLocked = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirtyRef.current = false;
    dirtyKeys.current.clear();
    tabsMetaDirty.current = false;
    setLockedLocal(true);
    setSaveState("saved");
    if (!lockedNotified.current) {
      lockedNotified.current = true;
      notify(t("editor.toast.locked"), "error");
    }
    try {
      const d = await api<LoadResponse>(`/api/theses/${thesisId}`);
      const serverTabs = d.thesis.tabs || [];
      contentsRef.current = { [SUBMISSION]: d.thesis.content, ...Object.fromEntries(serverTabs.map((tb) => [tb.id, tb.content])) };
      tabsRef.current = serverTabs;
      setTabs(serverTabs);
      const active = activeTabRef.current in contentsRef.current ? activeTabRef.current : SUBMISSION;
      activeTabRef.current = active;
      setActiveTab(active);
      loadIntoEditor(contentsRef.current[active] || "<p></p>");
      setThesis((x) => ({ ...x, ...d.thesis, references: d.thesis.references || x.references }));
      referencesRef.current = d.thesis.references || referencesRef.current;
      applyMetrics({ integrityScore: d.thesis.integrityScore, aiUsagePercent: d.thesis.aiUsagePercent, integrityBreakdown: d.integrityBreakdown });
    } catch {
      /* stays read-only with the text on screen */
    }
  }, [thesisId, notify, t, loadIntoEditor, applyMetrics]);
  onLockedRef.current = handleLocked;

  const switchTab = useCallback(
    (id: string) => {
      const ed = editorRef.current;
      if (!ed || id === activeTabRef.current) return;
      contentsRef.current[activeTabRef.current] = ed.getHTML();
      activeTabRef.current = id;
      setActiveTab(id);
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
    // The in-text mark must always point to an entry of this thesis's list: whatever `isNew` says, a reference whose
    // id is not in the list is appended, and one that is gets updated (no write when nothing changed).
    const current = referencesRef.current;
    const prev = current.find((r) => r.id === c.reference.id);
    if (!prev) saveReferences([...current, c.reference]);
    else if (JSON.stringify(prev) !== JSON.stringify(c.reference)) saveReferences(current.map((r) => (r.id === c.reference.id ? c.reference : r)));
    if (mode === "library") {
      notify(!prev ? t("editor.toast.referenceAdded") : t("editor.toast.referenceUpdated"), "success");
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
    // A pasted passage that now carries a citation is attributed: its provenance mark names the source, so the
    // ledger's "pasted text without attribution" line and the related notice can close.
    if (mode === "selection" && b > a) {
      const tr = ed.state.tr;
      let changed = false;
      ed.state.doc.nodesBetween(a, b, (node, pos) => {
        if (!node.isText) return;
        const m = node.marks.find((mk) => mk.type.name === "provenance" && mk.attrs.source === "paste" && !mk.attrs.label);
        if (!m) return;
        tr.addMark(Math.max(pos, a), Math.min(pos + node.nodeSize, b), m.type.create({ ...m.attrs, label: c.inText }));
        changed = true;
      });
      if (changed) programmatic(() => ed.view.dispatch(tr));
    }
    notify(t(!prev ? "editor.toast.citationInsertedNew" : "editor.toast.citationInserted", { cite: c.inText }), "success");
  };

  /**
   * "Cite" on a source: reuses the reference made from it (`sourceId`), else one with the same DOI, else one with the
   * same normalised title; only otherwise creates a reference, linked to the source. Inserted at the cursor.
   */
  const citeSource = (s: LibrarySource) => {
    const ed = editorRef.current;
    if (!ed || !canEdit) return notify(t("editor.toast.readOnly"), "error");
    const refs = referencesRef.current;
    const found = referenceForSource(s, refs, true);
    // An older entry of the same work gains the link to its full text.
    const reference: Reference = found ? (found.sourceId ? found : { ...found, sourceId: s.id }) : referenceFromSource(s, newReferenceId());
    const next = found ? refs.map((r) => (r.id === reference.id ? reference : r)) : [...refs, reference];
    const { from, to } = ed.state.selection;
    citeRange.current = { from, to };
    // Text, PDF and many web sources have no authors or year: inserting directly would print "(, )" and an empty entry.
    // The citation dialog opens on the entry instead, with its required fields, and reuses it when it already exists.
    if (!reference.authors.trim() || !reference.year.trim()) {
      setCiteText("");
      setCitePrefill(reference);
      setCiteMode("cursor");
      return;
    }
    insertCitation({ reference, isNew: !found, inText: inTextCitation(reference, thesis.citationStyle, next), markPassage: false }, "cursor");
  };

  /** "Insert (Author, year) at cursor" in the References tab: a real citation mark, restyled and counted like the others. */
  const insertReferenceAtCursor = (r: Reference) => {
    const ed = editorRef.current;
    if (!ed || !canEdit) return notify(t("editor.toast.readOnly"), "error");
    const { from, to } = ed.state.selection;
    citeRange.current = { from, to };
    // An entry without authors or year (an older "Cite" on a text source) is completed in the dialog first.
    if (!r.authors.trim() || !r.year.trim()) {
      setCiteText("");
      setCitePrefill(r);
      setCiteMode("cursor");
      return;
    }
    insertCitation({ reference: r, isNew: false, inText: inTextCitation(r, thesis.citationStyle, referencesRef.current), markPassage: false }, "cursor");
  };

  /** In-text citations per reference id: the open tab as it is now, plus every other tab as last loaded or saved. */
  const countCitations = useCallback(() => {
    const live = editorRef.current?.getHTML();
    const active = activeTabRef.current;
    return citationCounts(Object.keys(contentsRef.current).map((k) => (k === active && live !== undefined ? live : contentsRef.current[k])));
  }, []);

  /**
   * IEEE chips carry the position of their reference in the list sorted by author (the bibliography's order), so when
   * that order changes every chip is renumbered: the open tab through a transaction, the other tabs in their stored
   * HTML (saved with the next save). Chips keep their locator ("[3, p. 14]"); author-date styles never change here.
   */
  const renumberIeee = () => {
    const ed = editorRef.current;
    if (!ed || !canEdit) return;
    const refs = referencesRef.current;
    const edits: { from: number; to: number; text: string; marks: readonly import("prosemirror-model").Mark[] }[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const m = node.marks.find((mk) => mk.type.name === "citation");
      const ref = m && refs.find((r) => r.id === m.attrs.refId);
      const text = ref ? renumberedIeeeChip(node.text || "", ref, refs) : null;
      if (text !== null) edits.push({ from: pos, to: pos + node.nodeSize, text, marks: node.marks });
    });
    if (edits.length) {
      const tr = ed.state.tr;
      for (const e of edits.reverse()) tr.replaceWith(e.from, e.to, ed.state.schema.text(e.text, e.marks));
      programmatic(() => ed.view.dispatch(tr));
    }
    let others = false;
    for (const k of Object.keys(contentsRef.current)) {
      if (k === activeTabRef.current) continue;
      const html = contentsRef.current[k];
      const next = renumberIeeeHtml(html, refs);
      if (next === html) continue;
      contentsRef.current[k] = next;
      dirtyKeys.current.add(k);
      others = true;
    }
    if (others) {
      dirtyRef.current = true;
      setSaveState("unsaved");
      scheduleSave();
    }
  };
  const renumberIeeeRef = useRef(renumberIeee);
  renumberIeeeRef.current = renumberIeee;
  const ieeeKey = thesis.citationStyle === "IEEE" ? ieeeOrderKey(thesis.references || []) : "";
  const lastIeeeKey = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastIeeeKey.current;
    lastIeeeKey.current = ieeeKey;
    // Not when the editor opens (the stored text stays as it is until the list changes) and not in other styles.
    if (prev === null || !ieeeKey || prev === ieeeKey) return;
    renumberIeeeRef.current();
  }, [ieeeKey]);

  // Find support opens on its search tab unless the References tab asked for the Reference check.
  useEffect(() => {
    if (sidebar !== "cite") setCiteTab("find");
  }, [sidebar]);

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

  // Escape closes the mobile bottom sheet and, on any screen, the find & replace panel (the other desktop panels
  // keep their own close button so Escape in the editor does not swallow them).
  useEffect(() => {
    if (sidebar === "none" || (!isMobile && sidebar !== "find")) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSidebar("none");
      if (sidebar === "find") editorRef.current?.commands.focus();
    };
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

  /**
   * A Research copilot result (table, chart, test, diagram, equation) after its cost card (docs/papers.md §4.6, D27):
   * inserted after the block that holds the cursor, marked AI-assisted, as one undo step. "Keep as notes" sends it to
   * the Research notes tab instead. Refused without an AI log entry (interactionId, D12).
   */
  const insertArtifact: InsertArtifactHandler = (artifact, meta, opts) => {
    if (!meta.interactionId) return notify(t("figures.insert.noInteraction"), "error");
    if (!canEdit) return notify(t("editor.toast.readOnly"), "error");
    const toNotes = !!opts.asNotes;
    const run = () => {
      const ed = editorRef.current;
      if (!ed) return;
      // In the notes tab the result goes at the end, after what is already there.
      if (toNotes) ed.commands.focus("end");
      const r = insertArtifactCommand(ed, artifact, { provider: meta.provider, model: meta.model, mode: meta.mode, interactionId: meta.interactionId }, { programmatic });
      if (!r.ok) {
        // "limit": the figure node has already said that the tab is full.
        if (r.reason !== "limit") notify(t(r.reason === "no_interaction" ? "figures.insert.noInteraction" : r.reason === "read_only" ? "editor.toast.readOnly" : "figures.insert.invalid"), "error");
        return;
      }
      monitorRef.current?.recordAiInsert(r.words, meta.provider, meta.mode, meta.interactionId, { kind: r.kind, figures: r.figures, equations: r.equations, artifactId: meta.artifact.id });
      const notes = t("editor.notesTab");
      const message = toNotes
        ? t("editor.toast.keptAsNotes", { notes, aiAssisted, finalSubmission })
        : r.figures
          ? t("editor.toast.figureInserted", { aiAssisted })
          : r.kind === "equation"
            ? t("editor.toast.equationInserted", { aiAssisted })
            : t("editor.toast.aiInserted", { words: fmt.number(r.words), aiAssisted, provider: meta.provider });
      notify(message, "success");
      // Save right away so the score, the AI share, the ledger lines and the AI log reflect the insertion.
      saveNowRef.current().then(refreshLedger);
    };
    if (!toNotes) return run();
    const existing = tabsRef.current.find((tb) => isNotesTitle(tb.title));
    if (existing) {
      if (activeTabRef.current !== existing.id) switchTab(existing.id);
      setTimeout(run, 0);
      return;
    }
    if (tabsRef.current.length >= 20) return notify(t("editor.toast.tabLimit", { notes: t("editor.notesTab") }), "error");
    addTab(t("editor.notesTab"));
    setTimeout(run, 30);
  };

  /** Adds a provenance mark to the text of `from…to` that carries none (the AI-marked text keeps its own mark). */
  const markUnmarked = (ed: Editor, from: number, to: number, attrs: { source: "ai" | "paste"; label?: string; provider?: string; interactionId?: string }) => {
    const type = ed.schema.marks.provenance;
    if (!type) return;
    const max = ed.state.doc.content.size;
    const a = Math.max(0, Math.min(from, max));
    const b = Math.max(a, Math.min(to, max));
    const tr = ed.state.tr;
    ed.state.doc.nodesBetween(a, b, (node, pos) => {
      if (!node.isText) return true;
      if (!node.marks.some((m) => m.type === type)) tr.addMark(Math.max(a, pos), Math.min(b, pos + node.nodeSize), type.create(attrs));
      return false;
    });
    if (tr.docChanged) programmatic(() => ed.view.dispatch(tr));
  };

  /**
   * The part of a confirmed AI paste that carries no AI mark is a paste like any other (unless it is the student's own
   * copy from another tab): long, it opens the attribution dialog for that range; short, it is fingerprinted and
   * marked when it matches an assistant answer or a library source.
   */
  const attributePasteRest = (p: NonNullable<typeof aiPaste>, from: number, to: number) => {
    const rest = Math.max(0, p.cost.totalWords - p.cost.aiWords);
    const text = p.text;
    if (!rest || !text.trim() || (internalCopy.current && norm(text) === internalCopy.current)) return;
    if (rest >= PASTE_DIALOG_MIN_WORDS) {
      (async () => {
        const r = await monitorRef.current?.recordPaste(text, "pending");
        setPaste({ words: rest, text, html: "", matched: r?.match || null, fingerprint: r?.fingerprint || null, range: { from, to } });
      })();
      return;
    }
    monitorRef.current?.recordPaste(text).then(({ match }) => {
      const ed = editorRef.current;
      if (!match || !ed) return;
      if (match.kind === "source") {
        const label = `${match.authors || match.title || t("editor.source")}${match.year ? ` (${match.year})` : ""}${match.page ? `, p. ${match.page}` : ""}`;
        markUnmarked(ed, from, to, { source: "paste", label });
        notify(t("editor.toast.pasteMatchesSource", { source: match.title || t("editor.aSource") }), "info");
        return;
      }
      const label = match.mode === "copilot" ? t("editor.label.copilot") : t("editor.label.assistant");
      markUnmarked(ed, from, to, { source: "ai", provider: match.provider, label, interactionId: match.interactionId });
      monitorRef.current?.recordAiInsert(rest, match.provider || "assistant", match.mode || "paste", match.interactionId);
      notify(t("editor.toast.pastedFromAssistant", { label, aiAssisted }), "info");
    });
  };

  /** Pastes the AI content whose cost card was just confirmed, through ProseMirror's paste path (marks and figures kept). */
  const confirmAiPaste = () => {
    const p = aiPaste;
    setAiPaste(null);
    const ed = editorRef.current;
    if (!p || !ed || !canEdit) return;
    ed.commands.focus();
    if (p.pos !== null) ed.commands.setTextSelection(Math.min(p.pos, ed.state.doc.content.size));
    // A selected figure or equation is never replaced (the card's numbers would be wrong): the paste goes after it.
    const sel = ed.state.selection;
    if (sel instanceof NodeSelection) {
      const after = sel.to;
      if (sel.node.isInline) ed.commands.setTextSelection(after);
      else if (ed.state.doc.resolve(after).nodeAfter?.isTextblock) ed.commands.setTextSelection(after + 1);
      else programmatic(() => ed.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run());
    }
    const from = ed.state.selection.from;
    pasteBypass.current = true;
    try {
      ed.view.pasteHTML(p.html);
    } finally {
      pasteBypass.current = false;
    }
    const to = ed.state.selection.to;
    // A figure or block equation that now ends the document gets an empty paragraph after it, to keep writing below.
    const last = ed.state.doc.lastChild;
    if (last && (last.type.name === "chart" || last.type.name === "mathBlock")) programmatic(() => ed.chain().insertContentAt(ed.state.doc.content.size, { type: "paragraph" }).run());
    monitorRef.current?.recordAiInsert(p.cost.aiWords, p.cost.provider || "assistant", "paste", p.cost.interactionId, { figures: p.cost.figures, equations: p.cost.equations });
    attributePasteRest(p, from, to);
    saveNowRef.current().then(refreshLedger);
  };

  /** An AI-assisted equation of this paper (any tab) with the same LaTeX: its AI log entry, or null. */
  const aiEquationTwin = (latex: string): NonNullable<EquationValue["ai"]> | null => {
    const key = equationKey(latex);
    if (!key || !editor) return null;
    const hit: NonNullable<EquationValue["ai"]>[] = [];
    editor.state.doc.descendants((n) => {
      if (hit.length) return false;
      if ((n.type.name === "math" || n.type.name === "mathBlock") && n.attrs.origin === "ai" && equationKey(n.attrs.latex) === key) hit.push({ provider: n.attrs.provider ?? null, model: n.attrs.model ?? null, interaction: n.attrs.interaction ?? null });
      return true;
    });
    if (hit.length) return hit[0];
    const parser = new DOMParser();
    for (const [id, html] of Object.entries(contentsRef.current)) {
      if (id === activeTabRef.current || !html || !/data-origin="ai"/.test(html) || !/data-math/.test(html)) continue;
      const els = parser.parseFromString(html, "text/html").querySelectorAll('[data-math][data-origin="ai"], [data-math-block][data-origin="ai"]');
      for (const el of Array.from(els)) {
        if (equationKey(el.getAttribute("data-latex")) === key) return { provider: el.getAttribute("data-provider"), model: el.getAttribute("data-model"), interaction: el.getAttribute("data-interaction") };
      }
    }
    return null;
  };

  /**
   * Insert › Equation. What the student writes is Written (D22), unless it is the LaTeX of an AI-assisted equation of
   * this paper: that copy stays AI-assisted, and in the Final submission its cost card comes first (principle 5).
   */
  const submitEquation = (v: { latex: string; display: boolean; numbered: boolean }) => {
    if (!editor) return;
    const twin = aiEquationTwin(v.latex);
    if (twin && activeTabRef.current === SUBMISSION) {
      const type = v.display ? editor.schema.nodes.mathBlock : editor.schema.nodes.math;
      if (!type) return;
      const node = type.create({ latex: cleanLatex(v.latex).trim(), origin: "ai", provider: twin.provider, model: twin.model, interaction: twin.interaction, ...(v.display ? { numbered: !!v.numbered } : {}) });
      const holder = document.createElement("div");
      holder.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(node));
      setAiPaste({ html: holder.innerHTML, text: "", cost: { aiWords: 0, totalWords: 0, figures: 0, equations: 1, provider: twin.provider || undefined, interactionId: twin.interaction || undefined }, pos: null });
      return;
    }
    if (!programmatic(() => insertEquation(editor, twin ? { ...v, ai: twin } : v))) notify(t("figures.insert.invalid"), "error");
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
    const attrs = { source: (decision === "ai" ? "ai" : "paste") as "ai" | "paste", label: label || undefined, provider: decision === "ai" ? m?.provider || label?.toLowerCase() : undefined, interactionId: decision === "ai" ? m?.interactionId : undefined };
    if (p.range) {
      // The unmarked rest of a confirmed AI paste is already in the page: only its declaration is applied.
      if (decision !== "own") markUnmarked(editor, p.range.from, p.range.to, attrs);
    } else
      programmatic(() => {
        const from = editor.state.selection.from;
        editor.chain().focus().insertContent(html).run();
        const to = editor.state.selection.to;
        if (decision !== "own") {
          editor.chain().setTextSelection({ from, to }).setProvenance(attrs).setTextSelection(to).run();
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
    setAnchors(listAnchors(editor.state.doc));
    setDialog("link");
  };

  /** Scrolls to the heading or bookmark a `#…` link points to and puts the cursor there. */
  const goToAnchor = (href: string) => {
    if (!editor) return;
    const pos = findAnchorPos(editor.state.doc, href);
    if (pos === null) return notify(t("editor.toast.anchorMissing"), "info");
    editor.commands.setTextSelection(Math.min(pos + 1, editor.state.doc.content.size));
    const dom = editor.view.nodeDOM(pos);
    (dom instanceof HTMLElement ? dom : null)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  goToAnchorRef.current = goToAnchor;

  const insertBookmark = (name: string) => {
    if (!editor) return;
    if (listAnchors(editor.state.doc).some((a) => a.kind === "bookmark" && a.label.toLowerCase() === name.toLowerCase())) return notify(t("editor.toast.bookmarkExists", { name }), "error");
    programmatic(() => editor.chain().focus().setBookmark(name).run());
    notify(t("editor.toast.bookmarkAdded", { name }), "success");
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
    const labels = { figure: t("editor.doc.figure"), table: t("editor.doc.table"), tocTitle: t("editor.doc.toc"), tocEmpty: t("editor.doc.noHeadings"), footnotes: t("editor.doc.footnotes"), numberHeadings: !!ws.numberHeadings };
    try {
      if (fmt === "docx") downloadBlob(`${name}.docx`, await htmlToDocx(html, { title: thesis.title, author: thesis.studentName, orientation: thesis.pageSetup.orientation, marginCm: thesis.pageSetup.margin, lineSpacing: thesis.pageSetup.lineSpacing, headerText: thesis.pageSetup.headerText, footerText: thesis.pageSetup.footerText, pageNumbers: thesis.pageSetup.pageNumbers, numberHeadings: thesis.pageSetup.numberHeadings, labels }));
      if (fmt === "html") downloadBlob(`${name}.html`, new Blob([standaloneHtml(html, thesis.title, labels)], { type: "text/html" }));
      if (fmt === "md") downloadBlob(`${name}.md`, new Blob([htmlToMarkdown(html, labels)], { type: "text/markdown" }));
      if (fmt === "txt") downloadBlob(`${name}.txt`, new Blob([htmlToText(html, labels)], { type: "text/plain" }));
    } catch (e) {
      notify(t("editor.toast.exportFailed", { message: (e as Error).message }), "error");
    }
  };

  /** Re-renders every in-text citation chip in the new style; the reference list is regenerated on demand. */
  const restyleCitations = (style: Parameters<typeof formatReference>[1]) => {
    const ed = editorRef.current;
    if (!ed) return;
    const tr = ed.state.tr;
    const edits: { from: number; to: number; text: string; mark: import("prosemirror-model").Mark }[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const m = node.marks.find((mk) => mk.type.name === "citation");
      if (!m) return;
      const ref = referencesRef.current.find((r) => r.id === m.attrs.refId);
      if (!ref) return;
      const text = inTextCitation(ref, style, referencesRef.current);
      if (text && text !== node.text) edits.push({ from: pos, to: pos + node.nodeSize, text, mark: m });
    });
    for (const e of edits.reverse()) tr.replaceWith(e.from, e.to, ed.state.schema.text(e.text, [e.mark]));
    if (edits.length) programmatic(() => ed.view.dispatch(tr));
  };

  /** Closes a dialog that was reached from the text (Ctrl+K, Ctrl+Alt+B, special characters) and returns the caret. */
  const closeDialogToEditor = () => {
    setDialog(null);
    setTimeout(() => editorRef.current?.commands.focus(), 0);
  };

  const insertBibliography = () => {
    if (!editor) return;
    // The numbered list and the chips in the text must agree: chips left over from an older order are renumbered first.
    if (thesis.citationStyle === "IEEE") renumberIeee();
    const refs = [...referencesRef.current].sort((a, b) => a.authors.localeCompare(b.authors));
    const items = refs.map((r, i) => `<p>${thesis.citationStyle === "IEEE" ? `[${i + 1}] ` : ""}${formatReference(r, thesis.citationStyle).full}</p>`).join("");
    const title = t("editor.doc.references");
    programmatic(() => {
      // Replace an existing References block (heading plus the paragraphs under it) instead of adding a second one.
      let from = -1;
      let to = -1;
      editor.state.doc.forEach((node, offset) => {
        if (from === -1 && node.type.name === "heading" && node.textContent.trim() === title) {
          from = offset;
          to = offset + node.nodeSize;
        } else if (from !== -1 && to === offset && node.type.name === "paragraph") to = offset + node.nodeSize;
      });
      const chain = editor.chain().focus();
      if (from !== -1) chain.deleteRange({ from, to });
      chain.command(({ tr, commands }) => commands.insertContentAt(tr.doc.content.size, `<h2>${title}</h2>${items}`)).run();
    });
  };

  const insertToc = () => {
    if (!editor) return;
    programmatic(() => editor.chain().focus().insertToc().run());
  };

  const insertFootnote = () => {
    if (!editor) return;
    programmatic(() => editor.chain().focus().insertFootnote().run());
  };

  const updateThesis = async (patch: Record<string, unknown>, successMsg?: string): Promise<boolean> => {
    try {
      const res = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}`, { method: "PUT", json: patch });
      // Reference lists are written by saveReferences only: the answer to another change never replaces the local one.
      setThesis((t) => ({ ...t, ...res.thesis, content: t.content, references: t.references }));
      if (successMsg) notify(successMsg, "success");
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "locked") handleLocked();
      // No teacher (the paper lost its teacher meanwhile): the submit dialog says why, with the button disabled.
      else if (e instanceof ApiError && e.code === "no_teacher") {
        setThesis((x) => ({ ...x, professorId: undefined, teacherLabel: "none" }));
        setDialog("submit");
      } else notify(e instanceof ApiError && e.status === 413 ? t("editor.toast.tooLarge") : (e as Error).message, "error");
      return false;
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

  /** Upper / lower / Title case of the selection; marks (provenance included) are kept. */
  const changeCase = (mode: "upper" | "lower" | "title" | "cycle") => {
    if (!editor || !canEdit) return;
    if (editor.state.selection.empty) return notify(t("editor.toast.selectTextToChange"), "info");
    programmatic(() => (mode === "cycle" ? editor.chain().focus().cycleCase().run() : editor.chain().focus().changeCase(mode).run()));
  };

  const onAction = (a: MenuAction) => {
    if (!editor) return;
    if (a.startsWith("table:")) {
      runTableAction(editor, a.slice(6));
      return;
    }
    const c = () => editor.chain().focus();
    const map: Partial<Record<MenuAction, () => void>> = {
      new: () => router.push("/dashboard/papers?new=1"),
      open: () => router.push("/dashboard/papers"),
      rename: () => setDialog("rename"),
      save: () => saveNow(),
      saveVersion: () => setDialog("saveVersion"),
      versions: () => setSidebar("versions"),
      share: () => setDialog("share"),
      submit: () => setDialog("submit"),
      tour: () => setOnboardingPhase("intro"),
      "dl-docx": () => download("docx"),
      "dl-html": () => download("html"),
      "dl-md": () => download("md"),
      "dl-txt": () => download("txt"),
      print: () => window.print(),
      pageSetup: () => setDialog("pageSetup"),
      wordCount: () => setDialog("wordCount"),
      deadline: () => (settingsLock ? notify(settingsLock, "info") : setDialog(canEdit ? "deadline" : "wordCount")),
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
      // Sources & references (⋯ → Tools, mobile "More"): opens on References, or stays on the tab already open.
      references: () => setSidebar((s) => (isLibraryKind(s) ? s : "references")),
      provenance: () => setShowProvenance((v) => !v),
      "zoom-50": () => setZoom(50), "zoom-75": () => setZoom(75), "zoom-100": () => setZoom(100), "zoom-125": () => setZoom(125), "zoom-150": () => setZoom(150),
      fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),
      focus: () => setFocus((f) => !f),
      image: () => setDialog("image"),
      table: () => setDialog("table"),
      tableCaption: () => { programmatic(() => c().setTableCaption().run()); },
      equation: () => (canEdit ? setInsertForm({ kind: "equation" }) : notify(t("editor.toast.readOnly"), "error")),
      "diagram-gantt": () => (canEdit ? setInsertForm({ kind: "diagram", figure: "gantt" }) : notify(t("editor.toast.readOnly"), "error")),
      "diagram-prisma": () => (canEdit ? setInsertForm({ kind: "diagram", figure: "prisma" }) : notify(t("editor.toast.readOnly"), "error")),
      "diagram-conceptMap": () => (canEdit ? setInsertForm({ kind: "diagram", figure: "conceptMap" }) : notify(t("editor.toast.readOnly"), "error")),
      brief: () => thesis.assignment && setSidebar((s) => (s === "brief" ? "none" : "brief")),
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
      // Formatting only: provenance, comment and citation marks are records and survive "Clear formatting".
      clearFormat: () => c().clearFormatting().clearNodes().run(),
      specialChars: () => setDialog("specialChars"),
      bookmark: () => setDialog("bookmark"),
      caseUpper: () => changeCase("upper"), caseLower: () => changeCase("lower"), caseTitle: () => changeCase("title"), caseCycle: () => changeCase("cycle"),
      indentFirst: () => c().setIndentMode("first").run(), indentHanging: () => c().setIndentMode("hanging").run(), indentNone: () => c().setIndentMode(null).run(),
      numberHeadings: () => (canEdit ? updateThesis({ pageSetup: { ...thesis.pageSetup, numberHeadings: !thesis.pageSetup.numberHeadings } }) : setThesis((x) => ({ ...x, pageSetup: { ...x.pageSetup, numberHeadings: !x.pageSetup.numberHeadings } }))),
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
  onActionRef.current = onAction;

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
    const words = countWordsInText(editor.getText({ blockSeparator: " " }));
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
  // Header / footer settings reach the pagination plugin through data-hf-* on the workspace; a no-op transaction makes it re-read them.
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta("addToHistory", false));
  }, [ws.headerText, ws.footerText, ws.pageNumbers]);

  if (!editor) return <div className="min-h-screen bg-workspace flex items-center justify-center text-gray-400 text-sm">{t("editor.preparing")}</div>;

  const sidebarPanel = () => {
    switch (sidebar) {
      case "outline": return <OutlinePanel editor={editor} onClose={() => setSidebar("none")} />;
      case "brief": return thesis.assignment ? <BriefPanel view={thesis.assignment} onClose={() => setSidebar("none")} /> : null;
      case "comments": return (
        <CommentsPanel staffTag={t(teacherRole === "none" ? "glossary.teacher" : `papers.teacher.${teacherRole}`)} comments={comments} activeId={activeCommentId} canResolve={userRole !== "student" || isOwner} userId={userId} onJump={jumpToComment} onClose={() => setSidebar("none")} pendingQuote={pendingComment ? pendingComment.quote : null} onCreate={createComment}
          onCancelCreate={() => { if (pendingComment && canEdit) editor.commands.unsetComment(pendingComment.anchorId); setPendingComment(null); }}
          onReply={async (id, text) => { const r = await api<{ comment: CommentItem }>(`/api/theses/${thesisId}/comments/${id}`, { method: "POST", json: { text } }).catch(() => null); if (r) setComments((cs) => cs.map((x) => (x.id === id ? { ...x, replies: r.comment.replies } : x))); }}
          onResolve={async (id, resolved) => { await api(`/api/theses/${thesisId}/comments/${id}`, { method: "PATCH", json: { resolved } }).catch(() => {}); setComments((cs) => cs.map((x) => (x.id === id ? { ...x, resolved } : x))); const cm = comments.find((x) => x.id === id); if (resolved && cm && canEdit) { editor.commands.unsetComment(cm.anchorId); saveNow(); } }}
          onDelete={async (id) => { await api(`/api/theses/${thesisId}/comments/${id}`, { method: "DELETE" }).catch(() => {}); const cm = comments.find((x) => x.id === id); if (cm && canEdit) { editor.commands.unsetComment(cm.anchorId); saveNow(); } setComments((cs) => cs.filter((x) => x.id !== id)); }}
        />
      );
      case "versions": return (
        <VersionsPanel versions={versions} canRestore={canEdit} onClose={() => setSidebar("none")} onCreate={() => setDialog("saveVersion")}
          onPreview={async (id) => { const d = await api<{ version: { content: string; label?: string; kind: string; createdAt: string } }>(`/api/theses/${thesisId}/versions/${id}`).catch(() => null); if (d) setPreview({ id, html: d.version.content, label: d.version.label || `${versionKind(d.version.kind)} · ${fmt.dateTime(d.version.createdAt)}` }); }}
          onRestore={async (id) => { const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}/versions/${id}`, { method: "POST" }).catch((e) => { if (e instanceof ApiError && e.code === "locked") handleLocked(); else notify((e as Error).message, "error"); return null; }); if (d) { restoreSubmission(d.thesis); notify(t("editor.toast.versionRestored", { finalSubmission }), "success"); loadVersions(); } }}
        />
      );
      case "references":
      case "sources":
      case "library": return (
        <LibraryPanel tab={sidebar} onTab={(tab) => setSidebar(tab)} onClose={() => setSidebar("none")} editor={editor} thesisId={thesisId} canEdit={canEdit && !reviewMode} isOwner={isOwner}
          references={thesis.references} style={thesis.citationStyle} sources={sources || []} sourcesLoading={sources === null && !sourcesFailed} sourcesError={sourcesFailed ? t("panelsResearch.sources.errLoad") : ""} onRetrySources={retrySources} onSourcesChange={updateSources} countCitations={countCitations}
          selectionText={selectionText} sessionId={sessionId || undefined} onConsentRequired={() => setDialog("consent")} notify={notify}
          styleLock={settingsLock}
          onChangeStyle={(s) => { if (settingsLock) return notify(settingsLock, "info"); updateThesis({ citationStyle: s }); restyleCitations(s); }}
          onAddReference={(r) => saveReferences([...referencesRef.current, r], t("editor.toast.referenceAddedShort"))}
          onRemoveReference={(id) => saveReferences(referencesRef.current.filter((r) => r.id !== id), t("editor.toast.referenceRemoved"))}
          onInsertReference={insertReferenceAtCursor}
          onInsertBibliography={insertBibliography}
          onFindReference={() => openCite("library")}
          onCheckReferences={() => { setCiteTab("check"); setSidebar("cite"); }}
          onCiteSource={citeSource}
          onReferenceAdded={() => refreshReferences(true)}
          onSourceAdded={reloadSources}
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
        <CiteVerifiedPanel key={citeTab} initialTab={citeTab} editor={editor} thesisId={thesisId} sessionId={sessionId || undefined} selectionText={selectionText} references={thesis.references} citationStyle={thesis.citationStyle} canEdit={canEdit} onClose={() => setSidebar("none")} onConsentRequired={() => setDialog("consent")}
          onInsertCitation={(ref, o) => {
            const { from, to } = editor.state.selection;
            const hasSel = from !== to;
            citeRange.current = { from, to };
            // A new entry for a work this thesis already reads in full text is linked to that source.
            const src = !ref.sourceId && ref.doi ? (sources || []).find((x) => normDoi(x.doi) === normDoi(ref.doi)) : undefined;
            const reference = src ? { ...ref, sourceId: src.id } : ref;
            const known = referencesRef.current.some((r) => r.id === reference.id);
            insertCitation({ reference, isNew: !known, inText: inTextCitation(reference, thesis.citationStyle, known ? referencesRef.current : [...referencesRef.current, reference]), linkUrl: o.link, markPassage: hasSel && o.markPassage }, hasSel ? "selection" : "cursor");
          }}
          onReferencesChanged={applyReferences}
          onAddToLibrary={canEdit && !reviewMode ? (w) => { api(`/api/theses/${thesisId}/sources`, { method: "POST", json: w.doi ? { kind: "doi", value: w.doi, title: w.title } : { kind: "url", value: w.url, title: w.title } }).then(() => { notify(t("editor.toast.sourceAdded"), "success"); reloadSources(); }).catch((e) => notify((e as Error).message, "error")); } : undefined}
        />
      );
      case "process": return (
        <ProcessPanel thesisId={thesisId} isOwner={canEdit} sessionId={sessionId || undefined} onClose={() => setSidebar("none")} onOpenConsent={() => setDialog("consent")}
          onInsertDeclaration={(html) => { if (activeTabRef.current !== SUBMISSION) switchTab(SUBMISSION); programmatic(() => editor.chain().focus("end").insertContent(html).run()); saveNow(); notify(t("editor.toast.declarationAppended", { finalSubmission }), "success"); }}
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
          insertContext={{ wordCount: thesis.wordCount, aiWords: thesis.provenance.ai, limitPct: policy.maxAiUsagePercent, onFinalSubmission: activeTab === SUBMISSION, notesTitle: tabs.find((tb) => isNotesTitle(tb.title))?.title }}
          onClearSelection={clearSelectionContext}
          onAddComment={addCommentFromAssistant}
          onKeepAsNotes={canEdit ? keepAsNotes : undefined}
          onInsertArtifact={canEdit ? insertArtifact : undefined}
        />
      );
      default: return null;
    }
  };

  const panelTitle = (k: SidebarKind) => {
    const key = PANEL_TITLES[k] || `editor.panel.${k}`;
    const l = t(key);
    return l === key ? k : l;
  };

  const saveLabel = saveState === "saving" ? t("editor.save.saving") : saveState === "unsaved" ? t("editor.save.unsavedChanges") : saveState === "error" ? t("editor.save.failedRetry") : t("editor.save.savedAgo", { ago: formatTimeAgo(lastSaved, t, (d) => fmt.date(d)) });

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden print:!block print:!h-auto print:!overflow-visible" style={{ ["--doc-zoom" as string]: zoom / 100, ["--page-margin" as string]: `${ws.margin}cm`, ["--doc-line-height" as string]: ws.lineSpacing }}>
      {/* Header (52px) */}
      <header className="h-[52px] flex items-center gap-2 md:gap-3 pl-2 pr-3 bg-white border-b border-gray-200 flex-shrink-0" style={{ paddingTop: "env(safe-area-inset-top, 0px)", height: "calc(52px + env(safe-area-inset-top, 0px))" }}>
        <Link href={userRole === "student" ? "/dashboard" : "/admin/theses"} className="w-8 h-8 inline-flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0" aria-label={t("common.back")}><ArrowLeft className="w-[18px] h-[18px]" /></Link>
        <div className="hidden md:flex w-[30px] h-[30px] bg-brand-600 rounded-lg items-center justify-center flex-shrink-0 text-white" title={t(`papers.kind.${paper.kind}`)}><KindIcon kind={paper.kind} size={16} /></div>
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
        <span data-tour="integrity" className="hidden md:inline-flex flex-shrink-0"><IntegrityPill aiPct={aiPct} pastePct={pastePct} limitPct={policy.maxAiUsagePercent} score={integrityScore} onClick={() => setSidebar((x) => (x === "integrity" ? "none" : "integrity"))} /></span>
        {/* The assistant thinks with the author: a reviewer reads the thesis, so the panel is not offered in review. */}
        {isOwner && <button onClick={() => setSidebar((x) => (x === "ai" ? "none" : "ai"))} className={`hidden md:inline-flex items-center gap-1.5 px-3 py-[7px] rounded-full text-[13px] font-semibold flex-shrink-0 ${sidebar === "ai" ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"}`} aria-pressed={sidebar === "ai"}><Bot className="w-[15px] h-[15px]" />{t("glossary.aiAssistant")}</button>}
        <button onClick={() => setDialog("share")} className="hidden md:inline-flex items-center px-3.5 py-[7px] rounded-full bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 flex-shrink-0">{t("editor.share")}</button>
        {!isMobile && <MenuOverflow editor={editor} onAction={onAction} state={{ showProvenance, sidebar, spellcheck, zoom, focus, canEdit, numberHeadings: !!ws.numberHeadings, brief: !!thesis.assignment, settingsLock, teacherRole }} />}
        <button onClick={() => setMobileMenu(true)} className="md:hidden p-2 text-gray-600" aria-label={t("common.more")}><MoreVertical className="w-5 h-5" /></button>
      </header>

      {/* Document controls belong to the paper column; the assistant starts directly below the header. */}
      <div className="flex-1 flex min-h-0 print:!block print:!overflow-visible">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 print:!block">
          {/* Toolbar */}
          {!focus && (
            <Toolbar editor={editor} zoom={zoom} onZoom={setZoom} onLink={openLink} onImage={() => setDialog("image")} onTable={() => setDialog("table")} onComment={startComment} onCite={() => openCite()} onPrint={() => window.print()} spellcheck={spellcheck} onSpellcheck={setSpellcheck} compact={isMobile} provenance={{ on: showProvenance, onToggle: (v) => setShowProvenance(v), locked: reviewMode }} />
          )}

          {!focus && <DocumentTabs tabs={tabs} activeTab={activeTab} canEdit={canEdit} editor={editor} mobile={isMobile} getHtml={getTabHtml} onSwitch={switchTab} onAdd={() => addTab()} onRename={renameTab} onDuplicate={duplicateTab} onPromote={setConfirmPromote} onDelete={setConfirmDelete} />}
        <main className={`flex-1 overflow-auto print:!overflow-visible ${workspaceClass}`} data-hf-header={ws.headerText || ""} data-hf-footer={ws.footerText || ""} data-hf-num={ws.pageNumbers || "none"} style={{ ["--cap-figure" as string]: `"${t("editor.doc.figure")} "`, ["--cap-table" as string]: `"${t("editor.doc.table")} "`, ["--fn-title" as string]: `"${t("editor.doc.footnotes")}"` }} onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus("end"); }}>
          <div className="px-0 md:px-4 min-h-full">
            <div className={`docs-page ${ws.numberHeadings ? "num-headings" : ""}`} ref={sheetRef}>
              <FirstPageHeader setup={ws} pages={pageCount} />
              <EditorContent editor={editor} spellCheck={spellcheck} />
              {/* Stable wrappers: tippy moves the bubble elements into its popper, so React must never use them as sibling
                  references, and the bubbles stay mounted whatever the layout (unmounting one while tippy holds its node
                  throws removeChild and takes the page down, which is what happened when the print preview narrowed the
                  viewport below 768px). They hide themselves through shouldShow instead. */}
              <div className="contents"><TableBubble editor={editor} canEdit={canEdit} enabled={!isMobile} /></div>
              <div className="contents">
              <BubbleMenu editor={editor} tippyOptions={{ duration: 120, placement: "bottom", maxWidth: "none", popperOptions: { modifiers: [{ name: "keepOnSheet", enabled: true, phase: "main", requiresIfExists: ["preventOverflow"], fn: ({ state }) => { const sheet = sheetRef.current; const o = state.modifiersData.popperOffsets; if (!sheet || !o) return; const s = sheet.getBoundingClientRect(); const base = (state.elements.popper.offsetParent as HTMLElement | null)?.getBoundingClientRect().left || 0; const w = state.rects.popper.width; if (w < s.width) o.x = Math.max(s.left + 4, Math.min(o.x + base, s.right - w - 4)) - base; } }] } }} shouldShow={({ state }) => !state.selection.empty && !isMobile && !NODE_TOOLBARS.includes((state.selection as { node?: { type: { name: string } } }).node?.type.name || "") && !(state.selection instanceof CellSelection)}>
                <div className="bubble-menu !flex-col !items-stretch !gap-0" role="toolbar" aria-label={t("editor.bubble.label")}>
                  <div className="bm-row">
                  {canEdit && (
                    <>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={`bm-btn font-bold ${editor.isActive("bold") ? "active" : ""}`} aria-label={t("editor.fmt.bold")}>B</button>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={`bm-btn italic font-serif text-[15px] ${editor.isActive("italic") ? "active" : ""}`} aria-label={t("editor.fmt.italic")}>I</button>
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()} className={`bm-btn underline ${editor.isActive("underline") ? "active" : ""}`} aria-label={t("editor.fmt.underline")}>U</button>
                      <TypographyToggle open={bubbleTypo} onToggle={() => setBubbleTypo((v) => !v)} />
                      <span className="bm-sep" />
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => openCite()} className="bm-btn !px-[9px]"><BookMarked className="w-[13px] h-[13px]" />{t("editor.cite")}</button>
                    </>
                  )}
                  <button onMouseDown={(e) => e.preventDefault()} onClick={startComment} className="bm-btn !px-[9px]"><MessageSquarePlus className="w-[13px] h-[13px]" />{t("editor.comment")}</button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSidebar("cite")} className="bm-btn !px-[9px]" title={t("editor.bubble.supportTitle")}><SearchIcon className="w-[13px] h-[13px]" />{t("editor.support")}</button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSidebar("evidence")} className="bm-btn !px-[9px]" title={t("editor.bubble.evidenceTitle")}><Scale className="w-[13px] h-[13px]" />{t("editor.evidence")}</button>
                  {isOwner && <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSidebar("ai")} className="bm-btn !px-2.5 bg-brand-600 hover:bg-brand-700 font-semibold"><Bot className="w-[13px] h-[13px]" />{t("editor.askAi")}</button>}
                  </div>
                  {canEdit && bubbleTypo && <TypographyRow editor={editor} />}
                </div>
              </BubbleMenu>
              </div>
              {showProvenance && !isMobile && <ProvenanceGutter editor={editor} sheetRef={sheetRef} interactions={interactions} alwaysAnnotate={reviewMode} zoom={zoom / 100} />}
            </div>
          </div>
        </main>
        </div>
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

      {isOwner && !reviewMode && (
        <StudentOnboarding
          phase={onboardingPhase}
          onPhase={setOnboardingPhase}
          onEnsureAssistant={() => setSidebar("ai")}
          onDone={() => editor.commands.focus()}
          vars={{ ai: aiPct, limit: policy.maxAiUsagePercent }}
        />
      )}

      {/* Session bar (30px) */}
      <SessionBar
        sessionActive={!!sessionId}
        scopes={sessionId ? me?.consent?.scopes || { keystrokes: false, paste: true, aiInteractions: true, tabActivity: false } : null}
        onChange={() => setDialog("consent")}
        isOwner={isOwner}
        reviewMode={reviewMode}
        status={statusLabel(t, thesis.status)}
        teacher={{ role: teacherRole, name: thesis.professorId && thesis.professorName !== "Unassigned" ? thesis.professorName : undefined }}
        brief={thesis.assignment ? { open: sidebar === "brief", onToggle: () => setSidebar((k) => (k === "brief" ? "none" : "brief")) } : undefined}
        words={activeTab === SUBMISSION ? thesis.wordCount : tabWords}
        targetWords={thesis.targetWords}
        pages={!isMobile && pageCount > 0 ? pageCount : Math.max(1, Math.ceil((activeTab === SUBMISSION ? thesis.wordCount : tabWords) / 350))}
        citationStyle={thesis.citationStyle}
        library={{ sources: sources === null ? null : sources.length, references: thesis.references.length, open: isLibraryKind(sidebar), onToggle: () => setSidebar((k) => (isLibraryKind(k) ? "none" : "references")) }}
        zoom={zoom}
        onWordCount={() => setDialog("wordCount")}
        deadline={thesis.deadline}
        onDeadline={canEdit && !settingsLock ? () => setDialog("deadline") : undefined}
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
          {([...(thesis.assignment ? [["brief", t("editor.menu.assignmentBrief")]] : []), ["save", t("editor.menu.saveNow")], ["saveVersion", t("editor.menu.saveVersion")], ["versions", t("editor.menu.versionHistory")], ["find", t("editor.mobile.find")], ["references", t("glossary.sourcesReferences")], ["dl-docx", t("editor.mobile.dlDocx")], ["dl-md", t("editor.mobile.dlMd")], ["print", t("editor.mobile.print")], ["pageSetup", t("editor.menu.pageSetup")], ["wordCount", t("editor.menu.documentDetails")], ["provenance", showProvenance ? t("editor.mobile.hideProvenance") : t("editor.mobile.showProvenance")], ["share", t("editor.share")], ["submit", t("editor.menu.submit")], ["privacy", t("editor.mobile.privacy")], ["rename", t("editor.rename")], ["shortcuts", t("editor.mobile.shortcuts")]] as [MenuAction, string][]).map(([a, l]) => (
            <button key={a} onClick={() => { setMobileMenu(false); onAction(a); }} className="p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-left">{l}</button>
          ))}
        </div>
      </Modal>

      {/* Dialogs */}
      <LinkDialog open={dialog === "link"} onClose={closeDialogToEditor} initial={linkInitial} onSubmit={(url) => editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()} onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} anchors={anchors} onPickAnchor={(a) => { const href = anchorHref(editor, a); const chain = editor.chain().focus(); if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: a.label, marks: [{ type: "link", attrs: { href } }] }).run(); else chain.extendMarkRange("link").setLink({ href }).run(); }} />
      <SpecialCharsDialog open={dialog === "specialChars"} onClose={closeDialogToEditor} onInsert={(ch) => programmatic(() => editor.chain().focus().insertContent(ch).run())} />
      <TextPromptDialog open={dialog === "bookmark"} onClose={closeDialogToEditor} title={t("editor.bookmark.title")} label={t("editor.bookmark.label")} onSubmit={insertBookmark} submitLabel={t("editor.insert")} />
      <TableContextMenu editor={editor} at={tableMenuAt} onAction={(a) => runTableAction(editor, a)} onClose={() => setTableMenuAt(null)} />
      <PrintHeaderFooter setup={ws} page={{ size: ws.size, orientation: ws.orientation, margin: ws.margin }} />
      <ImageDialog open={dialog === "image"} replacing={imageReplacePos !== null} onClose={() => { setDialog(null); setImageReplacePos(null); }} onSubmit={(src, alt, caption) => { if (imageReplacePos !== null) patchImage(editor, imageReplacePos, { src, ...(alt ? { alt } : {}), ...(caption ? { caption } : {}) }); else insertImage(editor, { src, alt: alt || null, caption: caption || null }); }} />
      <TableDialog open={dialog === "table"} onClose={() => setDialog(null)} onSubmit={(rows, cols, header) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run()} />
      <PageSetupDialog open={dialog === "pageSetup"} onClose={() => setDialog(null)} value={ws} onSubmit={(v) => (canEdit ? updateThesis({ pageSetup: v }) : setThesis((t) => ({ ...t, pageSetup: v })))} />
      <WordCountDialog open={dialog === "wordCount"} onClose={() => setDialog(null)} stats={stats} thesis={thesis} />
      <DeadlineDialog
        open={dialog === "deadline"}
        onClose={() => setDialog(null)}
        deadline={thesis.deadline}
        onSave={async (iso) => {
          await updateThesis({ deadline: iso || "" }, t(iso ? "deadline.saved" : "deadline.removed"));
          setThesis((th) => ({ ...th, deadline: iso }));
        }}
      />
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} thesis={thesis} role={teacherRole} />
      <TextPromptDialog open={dialog === "rename"} onClose={() => setDialog(null)} title={t("editor.dialog.renameTitle")} initial={thesis.title} onSubmit={(title) => updateThesis({ title }, t("editor.toast.renamed"))} submitLabel={t("editor.rename")} />
      <TextPromptDialog open={dialog === "saveVersion"} onClose={closeDialogToEditor} title={t("editor.dialog.versionTitle")} label={t("editor.dialog.versionPlaceholder")} onSubmit={async (label) => { await saveNow(); await api(`/api/theses/${thesisId}/versions`, { method: "POST", json: { label } }).catch(() => {}); notify(t("editor.toast.versionSaved"), "success"); loadVersions(); }} submitLabel={t("editor.dialog.versionSubmit")} />
      <SubmitDialog
        open={dialog === "submit"}
        onClose={() => setDialog(null)}
        role={teacherRole}
        teacherName={thesis.professorName}
        lateDate={thesis.deadline && !handedIn && Date.now() > Date.parse(thesis.deadline) ? fmt.date(thesis.deadline) : undefined}
        onConfirm={async () => { await saveNow(); updateThesis({ status: "under_review" }, t("editor.toast.submitted")); }}
      />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} />
      <ConfirmDialog open={!!confirmPromote} onClose={() => setConfirmPromote(null)} title={t("editor.dialog.promoteTitle", { finalSubmission })} confirmLabel={t("editor.tabs.useAsSubmission", { finalSubmission })} body={t("editor.dialog.promoteBody", { title: tabs.find((tb) => tb.id === confirmPromote)?.title || "", finalSubmission })} onConfirm={() => confirmPromote && promoteTab(confirmPromote)} />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t("editor.dialog.deleteTitle")} danger confirmLabel={t("editor.tabs.delete")} body={t("editor.dialog.deleteBody", { title: tabs.find((tb) => tb.id === confirmDelete)?.title || "", finalSubmission })} onConfirm={() => confirmDelete && deleteTab(confirmDelete)} />
      <CitationDialog open={!!citeMode} onClose={() => { setCiteMode(null); setCitePrefill(null); }} selection={citeText} thesis={thesis} sources={sources || []} sessionId={sessionId} insertMode={citeMode || "cursor"} prefill={citePrefill} onInsert={(c) => insertCitation(c, citeMode || "cursor")} />
      <Modal open={dialog === "about"} onClose={() => setDialog(null)} title={t("editor.dialog.aboutTitle")} size="sm" footer={<button onClick={() => setDialog(null)} className="btn-primary !py-2 !px-4 text-sm">{t("common.close")}</button>}>
        <p className="text-sm text-gray-600">{t("editor.dialog.aboutBody")}</p>
      </Modal>
      <VersionPreviewDialog open={!!preview} onClose={() => setPreview(null)} html={preview?.html || ""} label={preview?.label || ""} schema={editor.schema} canRestore={canEdit} onRestore={async () => { if (!preview) return; const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}/versions/${preview.id}`, { method: "POST" }).catch((e) => { if (e instanceof ApiError && e.code === "locked") handleLocked(); else notify((e as Error).message, "error"); return null; }); if (d) { restoreSubmission(d.thesis); notify(t("editor.toast.versionRestored", { finalSubmission }), "success"); loadVersions(); } }} />
      <PasteAttributionDialog open={!!paste} words={paste?.words || 0} matched={paste?.matched || null} onDecide={decidePaste} onDismiss={() => decidePaste("none")} />
      <AiPasteDialog open={!!aiPaste} cost={aiPaste?.cost || null} ctx={{ wordCount: thesis.wordCount, aiWords: thesis.provenance.ai, limitPct: policy.maxAiUsagePercent }} role={teacherRole} onConfirm={confirmAiPaste} onCancel={() => { setAiPaste(null); editor.commands.focus(); }} />
      {/* Insert › Equation and Insert › Diagram: what the student makes here is Written (origin "human", D22). */}
      <EquationDialog
        open={insertForm?.kind === "equation"}
        onClose={() => setInsertForm(null)}
        onSubmit={(v) => {
          setInsertForm(null);
          submitEquation(v);
        }}
      />
      {insertForm?.kind === "diagram" && (
        <DiagramDialog
          open
          kind={insertForm.figure}
          lang={thesis.writingLanguage || "en"}
          onClose={() => setInsertForm(null)}
          onSubmit={(v) => {
            setInsertForm(null);
            programmatic(() => insertDiagram(editor, { spec: v.spec, caption: v.caption, lang: thesis.writingLanguage || "en" }));
          }}
        />
      )}
      {me?.policy && (
        <ConsentModal open={dialog === "consent"} onClose={() => setDialog(null)} policy={me.policy} existing={me.consent} thesisId={thesisId} onGranted={async () => { await refreshMe(); if (!monitorRef.current) startSession(); else notify(t("editor.toast.monitoringUpdated"), "success"); }} />
      )}
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}
