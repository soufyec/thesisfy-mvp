"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
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
import { ArrowLeft, Bot, ChevronDown, Cloud, CloudOff, FileText, ListTree, MessageSquare, MoreVertical, Share2, ShieldCheck } from "lucide-react";
import { CommentMark, FontSize, Indent, LineHeight, PageBreak, Provenance, Search } from "./extensions";
import Toolbar from "./Toolbar";
import MenuBar, { MenuAction } from "./MenuBar";
import { CommentsPanel, FindPanel, IntegrityPanel, OutlinePanel, ReferencesPanel, VersionsPanel } from "./Sidebars";
import { ConfirmDialog, ImageDialog, LinkDialog, PageSetupDialog, PasteAttributionDialog, PasteDecision, ShareDialog, ShortcutsDialog, TableDialog, TextPromptDialog, VersionPreviewDialog, WordCountDialog } from "./Dialogs";
import { CommentItem, FlagItem, formatReference, Reference, SidebarKind, ThesisDoc, VersionItem } from "./types";
import AssistantPanel, { InsertMeta } from "../ai/AssistantPanel";
import ConsentModal from "../ConsentModal";
import { Modal, Toast } from "../ui";
import { useUser, type Consent } from "../useUser";
import { api, ApiError, countWordsInText, timeAgo } from "@/lib/client";
import { SessionMonitor, type MonitorFlag } from "@/lib/monitor";
import { downloadBlob, htmlToDocx, htmlToMarkdown, htmlToText, safeFileName, standaloneHtml } from "@/lib/export";

interface LoadResponse {
  thesis: ThesisDoc;
  comments: CommentItem[];
  flags: FlagItem[];
  versionCount: number;
  policy: { maxAiUsagePercent: number; requireConsent: boolean; university: string };
}

const PASTE_DIALOG_MIN_WORDS = 30;

export default function DocsEditor({ thesisId, reviewMode = false }: { thesisId: string; reviewMode?: boolean }) {
  const [data, setData] = useState<LoadResponse | null>(null);
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
          <Link href="/dashboard" className="btn-primary">Back to dashboard</Link>
        </div>
      </div>
    );
  if (!data || loading || !user) return <div className="min-h-screen bg-[#f1f3f4] flex items-center justify-center text-gray-400 text-sm">Loading document…</div>;
  return <DocsEditorInner initial={data} thesisId={thesisId} userId={user.id} userRole={user.role} reviewMode={reviewMode} />;
}

function DocsEditorInner({ initial, thesisId, userId, userRole, reviewMode }: { initial: LoadResponse; thesisId: string; userId: string; userRole: string; reviewMode: boolean }) {
  const router = useRouter();
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
  const [showProvenance, setShowProvenance] = useState(reviewMode);
  const [zoom, setZoom] = useState(100);
  const [spellcheck, setSpellcheck] = useState(true);
  const [focus, setFocus] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingComment, setPendingComment] = useState<{ anchorId: string; quote: string } | null>(null);
  const [dialog, setDialog] = useState<null | "link" | "image" | "table" | "pageSetup" | "wordCount" | "share" | "rename" | "saveVersion" | "submit" | "shortcuts" | "about" | "consent">(null);
  const [linkInitial, setLinkInitial] = useState("");
  const [paste, setPaste] = useState<{ words: number; text: string; html: string; matched: { provider?: string; host?: string } | null } | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string; label: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<Record<string, number> | null>(null);
  const monitorRef = useRef<SessionMonitor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const lastCounts = useRef({ chars: 0, words: 0 });
  const policy = initial.policy;

  const notify = useCallback((message: string, kind: "info" | "success" | "error" = "info") => setToast({ message, kind }), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ---------- editor ----------
  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
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
      Placeholder.configure({ placeholder: "Start writing your thesis… Type / for nothing special; use the toolbar or menus." }),
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      Typography,
      Provenance,
      CommentMark,
      LineHeight,
      Indent,
      PageBreak,
      Search,
    ],
    content: initial.thesis.content,
    editorProps: {
      attributes: { class: "docs-editor", spellcheck: "true" },
      handleClick: (_view, _pos, event) => {
        const el = (event.target as HTMLElement).closest?.(".thesisfy-comment") as HTMLElement | null;
        if (el) {
          setActiveCommentId(el.getAttribute("data-comment-id"));
          setSidebar("comments");
        }
        return false;
      },
      handlePaste: (view, event) => {
        if (!canEdit) return false;
        const text = event.clipboardData?.getData("text/plain") || "";
        const html = event.clipboardData?.getData("text/html") || "";
        const words = countWordsInText(text);
        if (!words) return false;
        if (words >= PASTE_DIALOG_MIN_WORDS) {
          event.preventDefault();
          (async () => {
            const matched = (await monitorRef.current?.recordPaste(text)) || null;
            setPaste({ words, text, html, matched });
          })();
          return true;
        }
        // Small paste: let ProseMirror handle it, fingerprint in the background and attribute if it matches an AI copy.
        const from = view.state.selection.from;
        monitorRef.current?.recordPaste(text).then((matched) => {
          if (!matched || !editorRef.current) return;
          const ed = editorRef.current;
          const to = Math.min(from + text.length, ed.state.doc.content.size);
          ed.chain().setTextSelection({ from, to }).setProvenance({ source: "ai", provider: matched.provider, label: matched.host }).setTextSelection(to).run();
          notify(`Pasted text matched a copy from ${matched.host || matched.provider}: marked as AI-assisted.`, "info");
        });
        return false;
      },
      handleKeyDown: (_view, event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return false;
        const k = event.key.toLowerCase();
        if (k === "s") { event.preventDefault(); saveNow(); return true; }
        if (k === "h") { event.preventDefault(); setSidebar("find"); return true; }
        if (k === "k") { event.preventDefault(); openLink(); return true; }
        if (k === "p") { event.preventDefault(); window.print(); return true; }
        if (k === "m" && event.altKey) { event.preventDefault(); startComment(); return true; }
        if (k === "c" && event.shiftKey) { event.preventDefault(); setDialog("wordCount"); return true; }
        if (k === "/") { event.preventDefault(); setDialog("shortcuts"); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!canEdit) return;
      dirtyRef.current = true;
      setSaveState("unsaved");
      scheduleSave();
      const chars = ed.storage.characterCount.characters();
      const words = ed.storage.characterCount.words();
      const isPaste = transaction.getMeta("paste") || transaction.getMeta("uiEvent") === "paste";
      if (!isPaste && !transaction.getMeta("ai-insert")) monitorRef.current?.recordTyping(chars - lastCounts.current.chars, words - lastCounts.current.words);
      lastCounts.current = { chars, words };
      scheduleProvenance(ed);
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
    if (editor) lastCounts.current = { chars: editor.storage.characterCount.characters(), words: editor.storage.characterCount.words() };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(canEdit, false);
  }, [editor, canEdit]);

  // ---------- provenance (live, client-side) ----------
  const provTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleProvenance = (ed: Editor) => {
    if (provTimer.current) clearTimeout(provTimer.current);
    provTimer.current = setTimeout(() => {
      let ai = 0, paste = 0;
      ed.state.doc.descendants((node) => {
        if (!node.isText || !node.text) return;
        const m = node.marks.find((x) => x.type.name === "provenance");
        if (!m) return;
        const w = countWordsInText(node.text);
        if (m.attrs.source === "ai") ai += w;
        else paste += w;
      });
      const total = ed.storage.characterCount.words();
      setThesis((t) => ({ ...t, wordCount: total, provenance: { human: Math.max(0, total - ai - paste), ai, paste } }));
    }, 400);
  };

  // ---------- saving ----------
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(), 2500);
  };
  const saveNow = useCallback(
    async (extra: Record<string, unknown> = {}) => {
      const ed = editorRef.current;
      if (!ed || !canEdit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      try {
        const res = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}`, { method: "PUT", json: { content: ed.getHTML(), sessionId: sessionId || undefined, ...extra } });
        dirtyRef.current = false;
        setThesis((t) => ({ ...t, ...res.thesis, content: t.content }));
        setLastSaved(new Date().toISOString());
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        notify(`Save failed: ${(e as Error).message}`, "error");
      }
    },
    [canEdit, thesisId, sessionId, notify]
  );

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
  const startSession = useCallback(async () => {
    if (!isOwner || monitorRef.current) return;
    try {
      const res = await api<{ session: { id: string }; consent: Consent | null }>(`/api/theses/${thesisId}/sessions`, { method: "POST" });
      setSessionId(res.session.id);
      const scopes = res.consent?.scopes || { keystrokes: false, paste: true, aiInteractions: true, tabActivity: false, extensionActivity: false, extensionPromptText: false };
      monitorRef.current = new SessionMonitor(res.session.id, scopes, {
        onFlags: (fl: MonitorFlag[]) => {
          setFlags((prev) => [...fl.map((f) => ({ ...f, timestamp: new Date().toISOString(), resolved: false })), ...prev]);
          notify(fl[0].description, "error");
          api<LoadResponse>(`/api/theses/${thesisId}`).then((d) => setThesis((t) => ({ ...t, integrityScore: d.thesis.integrityScore, aiUsagePercent: d.thesis.aiUsagePercent }))).catch(() => {});
        },
        onStats: setSessionStats,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 428) setDialog("consent");
      else notify((e as Error).message, "error");
    }
  }, [isOwner, thesisId, notify]);

  useEffect(() => {
    if (!isOwner) return;
    if (policy.requireConsent && !me?.consent) setDialog("consent");
    else startSession();
    return () => {
      monitorRef.current?.end();
      monitorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  // ---------- helpers ----------
  const insertWithProvenance = (html: string, meta: InsertMeta, replace: boolean) => {
    if (!editor || !canEdit) return notify("This document is read-only.", "error");
    const chain = editor.chain().focus();
    if (replace) chain.deleteSelection();
    const from = replace ? editor.state.selection.from : editor.state.selection.to;
    chain.insertContent(html).run();
    const to = editor.state.selection.to;
    editor.chain().setTextSelection({ from, to }).setProvenance({ source: "ai", provider: meta.provider, label: meta.model, interactionId: meta.interactionId }).setTextSelection(to).setMeta("ai-insert", true).run();
    monitorRef.current?.recordAiInsert(meta.words, meta.provider, meta.mode, meta.interactionId);
    notify(`${meta.words} words inserted and marked as AI-assisted (${meta.provider}).`, "success");
  };

  const decidePaste = (decision: PasteDecision, label?: string) => {
    if (!paste || !editor) return;
    const p = paste;
    setPaste(null);
    const from = editor.state.selection.from;
    const paragraphs = p.text.split(/\n{2,}|\r\n\r\n/).map((s) => s.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = decision === "own" && p.html ? p.html : paragraphs.map((s) => `<p>${esc(s)}</p>`).join("");
    editor.chain().focus().insertContent(html).run();
    const to = editor.state.selection.to;
    if (decision !== "own") {
      editor.chain().setTextSelection({ from, to }).setProvenance({ source: decision === "ai" ? "ai" : "paste", label: label || (decision === "ai" ? p.matched?.host : undefined), provider: decision === "ai" ? p.matched?.provider || label?.toLowerCase() : undefined }).setTextSelection(to).run();
      if (decision === "ai") monitorRef.current?.recordAiInsert(p.words, p.matched?.provider || label || "external", "paste", undefined);
    }
    monitorRef.current?.flush();
  };

  const openLink = () => {
    if (!editor) return;
    setLinkInitial((editor.getAttributes("link").href as string) || "");
    setDialog("link");
  };

  const startComment = () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return notify("Select the text you want to comment on.", "info");
    const quote = editor.state.doc.textBetween(from, to, " ").slice(0, 200);
    const anchorId = `cmt_${Date.now().toString(36)}`;
    if (canEdit) editor.chain().focus().setComment(anchorId).run();
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
    const name = safeFileName(thesis.title);
    try {
      if (fmt === "docx") downloadBlob(`${name}.docx`, await htmlToDocx(html, { title: thesis.title, author: thesis.studentName, orientation: thesis.pageSetup.orientation, marginCm: thesis.pageSetup.margin, lineSpacing: thesis.pageSetup.lineSpacing }));
      if (fmt === "html") downloadBlob(`${name}.html`, new Blob([standaloneHtml(html, thesis.title)], { type: "text/html" }));
      if (fmt === "md") downloadBlob(`${name}.md`, new Blob([htmlToMarkdown(html)], { type: "text/markdown" }));
      if (fmt === "txt") downloadBlob(`${name}.txt`, new Blob([htmlToText(html)], { type: "text/plain" }));
    } catch (e) {
      notify(`Export failed: ${(e as Error).message}`, "error");
    }
  };

  const insertBibliography = () => {
    if (!editor) return;
    const refs = [...thesis.references].sort((a, b) => a.authors.localeCompare(b.authors));
    const items = refs.map((r, i) => `<p>${thesis.citationStyle === "IEEE" ? `[${i + 1}] ` : ""}${formatReference(r, thesis.citationStyle).full}</p>`).join("");
    editor.chain().focus().insertContent(`<h2>References</h2>${items}`).run();
  };

  const insertToc = () => {
    if (!editor) return;
    const items: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading" && node.attrs.level > 1) items.push(`<li><p>${"&nbsp;&nbsp;".repeat(node.attrs.level - 2)}${node.textContent}</p></li>`);
    });
    editor.chain().focus().insertContent(`<h2>Table of Contents</h2><ul>${items.join("") || "<li><p>(no headings yet)</p></li>"}</ul>`).run();
  };

  const insertFootnote = () => {
    if (!editor) return;
    const n = (editor.state.doc.textContent.match(/\[\d+\]/g) || []).length + 1;
    editor.chain().focus().insertContent(`<sup>[${n}]</sup>`).run();
    const end = editor.state.doc.content.size;
    editor.chain().insertContentAt(end, `<p><sup>[${n}]</sup> Footnote text</p>`).setTextSelection(editor.state.doc.content.size - 14).run();
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
      paste: () => navigator.clipboard?.readText().then((t) => t && c().insertContent(t).run()).catch(() => notify("Use Ctrl+V to paste.", "info")),
      pastePlain: () => navigator.clipboard?.readText().then((t) => t && c().insertContent(t.replace(/</g, "&lt;")).run()).catch(() => notify("Use Ctrl+Shift+V to paste.", "info")),
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
      date: () => c().insertContent(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })).run(),
      citation: () => setSidebar("references"),
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
      extension: () => router.push("/dashboard/settings#extension"),
      shortcuts: () => setDialog("shortcuts"),
      about: () => setDialog("about"),
    };
    map[a]?.();
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

  const aiPct = thesis.wordCount ? Math.round((thesis.provenance.ai / thesis.wordCount) * 100) : 0;
  const ws = thesis.pageSetup;
  const workspaceClass = `docs-workspace ${ws.orientation === "landscape" ? "landscape" : ""} ${ws.size === "Letter" ? "letter" : ""} ${showProvenance ? "show-provenance" : ""}`;

  if (!editor) return <div className="min-h-screen bg-[#f1f3f4] flex items-center justify-center text-gray-400 text-sm">Preparing editor…</div>;

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
          onPreview={async (id) => { const d = await api<{ version: { content: string; label?: string; kind: string; createdAt: string } }>(`/api/theses/${thesisId}/versions/${id}`).catch(() => null); if (d) setPreview({ id, html: d.version.content, label: d.version.label || `${d.version.kind} · ${new Date(d.version.createdAt).toLocaleString()}` }); }}
          onRestore={async (id) => { const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}/versions/${id}`, { method: "POST" }).catch((e) => { notify((e as Error).message, "error"); return null; }); if (d) { editor.commands.setContent(d.thesis.content); setThesis((t) => ({ ...t, ...d.thesis })); notify("Version restored. The previous state was saved as a version too.", "success"); loadVersions(); } }}
        />
      );
      case "references": return (
        <ReferencesPanel references={thesis.references} style={thesis.citationStyle} canEdit={canEdit} onClose={() => setSidebar("none")}
          onChangeStyle={(s) => updateThesis({ citationStyle: s })}
          onAdd={(r: Reference) => updateThesis({ references: [...thesis.references, r] }, "Reference added")}
          onRemove={(id) => updateThesis({ references: thesis.references.filter((r) => r.id !== id) })}
          onInsertInText={(r) => editor.chain().focus().insertContent(formatReference(r, thesis.citationStyle).inText).run()}
          onInsertBibliography={insertBibliography}
        />
      );
      case "find": return <FindPanel editor={editor} onClose={() => setSidebar("none")} canEdit={canEdit} />;
      case "integrity": return (
        <IntegrityPanel thesis={thesis} flags={flags} session={sessionStats} maxAi={policy.maxAiUsagePercent} showProvenance={showProvenance} onToggleProvenance={() => setShowProvenance((v) => !v)} isOwner={isOwner} onClose={() => setSidebar("none")}
          onRespondFlag={async (id, note) => { await api(`/api/flags/${id}`, { method: "PATCH", json: { studentNote: note } }).catch(() => {}); setFlags((fs) => fs.map((f) => (f.id === id ? { ...f, description: `${f.description}\n\nStudent response: ${note}` } : f))); notify("Your response was sent to your advisor.", "success"); }}
        />
      );
      case "ai": return (
        <AssistantPanel thesisId={thesisId} sessionId={sessionId || undefined} selection={selectionText} onInsert={canEdit ? (h, m) => insertWithProvenance(h, m, false) : undefined} onReplaceSelection={canEdit ? (h, m) => insertWithProvenance(h, m, true) : undefined} onConsentRequired={() => setDialog("consent")} onRejectSuggestion={(m) => monitorRef.current?.recordAiRejected(m.provider, m.mode)} />
      );
      default: return null;
    }
  };

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Save failed — retrying on next change" : `Saved ${timeAgo(lastSaved)}`;

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden" style={{ ["--doc-zoom" as string]: zoom / 100, ["--page-margin" as string]: `${ws.margin}cm`, ["--doc-line-height" as string]: ws.lineSpacing }}>
      {/* Title bar */}
      <header className="flex items-center gap-2 px-2 md:px-3 pt-2 md:pt-2 flex-shrink-0" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Link href={userRole === "student" ? "/dashboard" : "/admin/theses"} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="Back"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="hidden md:flex w-10 h-10 bg-brand-600 rounded-lg items-center justify-center flex-shrink-0"><FileText className="w-6 h-6 text-white" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => canEdit && setDialog("rename")} className={`text-base md:text-lg font-medium truncate text-gray-800 ${canEdit ? "hover:bg-gray-100 rounded px-1 -mx-1" : "cursor-default"}`} title={thesis.title}>{thesis.title}</button>
            <span className={`hidden sm:inline badge ${thesis.status === "approved" ? "badge-success" : thesis.status === "under_review" ? "badge-info" : thesis.status === "revision_requested" ? "badge-danger" : "badge-warning"} !text-[10px]`}>{thesis.status.replace("_", " ")}</span>
            {!canEdit && <span className="badge bg-gray-100 text-gray-500 !text-[10px]">read-only</span>}
          </div>
          {!isMobile && !focus && <MenuBar editor={editor} onAction={onAction} state={{ showProvenance, sidebar, spellcheck, zoom, focus, canEdit }} />}
          {isMobile && <div className="text-[11px] text-gray-400 flex items-center gap-1 px-1">{saveState === "error" ? <CloudOff className="w-3 h-3 text-red-500" /> : <Cloud className="w-3 h-3" />}{saveLabel}</div>}
        </div>
        <div className="hidden md:flex items-center gap-1 text-xs text-gray-400 mr-2">{saveState === "error" ? <CloudOff className="w-4 h-4 text-red-500" /> : <Cloud className="w-4 h-4" />}{saveLabel}</div>
        <button onClick={() => setSidebar((s) => (s === "ai" ? "none" : "ai"))} className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium ${sidebar === "ai" ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"}`}><Bot className="w-4 h-4" />AI</button>
        <button onClick={() => setDialog("share")} className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#c2e7ff] text-[#001d35] text-sm font-medium hover:shadow"><Share2 className="w-4 h-4" />Share</button>
        <button onClick={() => setMobileMenu(true)} className="md:hidden p-2 text-gray-600" aria-label="More"><MoreVertical className="w-5 h-5" /></button>
      </header>

      {/* Toolbar */}
      {!focus && (
        <Toolbar editor={editor} zoom={zoom} onZoom={setZoom} onLink={openLink} onImage={() => setDialog("image")} onTable={() => setDialog("table")} onComment={startComment} onPrint={() => window.print()} spellcheck={spellcheck} onSpellcheck={setSpellcheck} compact={isMobile} />
      )}

      {/* Session strip */}
      {isOwner && !focus && (
        <div className="bg-brand-50 border-y border-brand-100 px-3 py-1 flex items-center gap-3 text-[11px] text-brand-800 flex-shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">
          <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${sessionId ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />{sessionId ? "Session active · transparent mode" : "Monitoring paused"}</span>
          <span className="text-brand-600">AI-assisted {aiPct}% / {policy.maxAiUsagePercent}%</span>
          <span className="text-brand-600">Integrity {thesis.integrityScore}%</span>
          {sessionStats && <span className="text-brand-500 hidden sm:inline">{sessionStats.keystrokes} keystrokes · {sessionStats.aiAssists} AI assists · {sessionStats.pasteEvents} pastes</span>}
          <button onClick={() => setSidebar("integrity")} className="ml-auto underline decoration-dotted">details</button>
          <button onClick={() => setDialog("consent")} className="underline decoration-dotted">choices</button>
        </div>
      )}
      {reviewMode && (
        <div className="bg-amber-50 border-y border-amber-100 px-3 py-1 text-[11px] text-amber-800 flex-shrink-0 flex items-center gap-3"><ShieldCheck className="w-3.5 h-3.5" />Review mode: AI-assisted text is highlighted in purple, pasted text in amber. Select text to add comments.</div>
      )}

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <main className={`flex-1 overflow-auto ${workspaceClass}`} onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus("end"); }}>
          <div className="py-3 md:py-8 px-0 md:px-4 min-h-full">
            <div className="docs-page" style={{ fontFamily: undefined }}>
              <EditorContent editor={editor} spellCheck={spellcheck} />
            </div>
          </div>
        </main>
        {sidebar !== "none" && !focus && !isMobile && <aside className="w-[380px] xl:w-[420px] border-l border-gray-200 flex flex-col flex-shrink-0 min-h-0">{sidebarPanel()}</aside>}
      </div>

      {/* Status bar */}
      <footer className="hidden md:flex items-center gap-4 px-4 py-1 border-t border-gray-100 text-[11px] text-gray-500 flex-shrink-0 bg-white">
        <button onClick={() => setDialog("wordCount")} className="hover:text-gray-800">{thesis.wordCount.toLocaleString()} / {thesis.targetWords.toLocaleString()} words</button>
        <span>Page ~{stats.pages}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-purple-500" />AI {aiPct}%</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Pasted {thesis.wordCount ? Math.round((thesis.provenance.paste / thesis.wordCount) * 100) : 0}%</span>
        <span className="ml-auto">{thesis.citationStyle} · {ws.size} {ws.orientation} · {zoom}%</span>
      </footer>

      {/* Mobile bottom action bar */}
      {isMobile && (
        <nav className="flex justify-around border-t border-gray-200 bg-white flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {([["ai", <Bot key="a" className="w-5 h-5" />, "AI"], ["comments", <MessageSquare key="c" className="w-5 h-5" />, "Comments"], ["outline", <ListTree key="o" className="w-5 h-5" />, "Outline"], ["integrity", <ShieldCheck key="i" className="w-5 h-5" />, "Integrity"]] as [SidebarKind, React.ReactNode, string][]).map(([k, icon, label]) => (
            <button key={k} onClick={() => setSidebar((s) => (s === k ? "none" : k))} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${sidebar === k ? "text-brand-600" : "text-gray-500"}`}>{icon}{label}</button>
          ))}
          <button onClick={() => setMobileMenu(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-gray-500"><ChevronDown className="w-5 h-5" />More</button>
        </nav>
      )}
      {isMobile && sidebar !== "none" && (
        <div className="fixed inset-x-0 bottom-0 top-[30%] z-[60] bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 flex flex-col animate-slide-up">{sidebarPanel()}</div>
      )}
      <Modal open={mobileMenu} onClose={() => setMobileMenu(false)} title={thesis.title} size="sm">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {([["save", "Save now"], ["saveVersion", "Save named version"], ["versions", "Version history"], ["find", "Find & replace"], ["references", "Citations"], ["dl-docx", "Download .docx"], ["dl-md", "Download .md"], ["print", "Print / PDF"], ["pageSetup", "Page setup"], ["wordCount", "Document details"], ["provenance", showProvenance ? "Hide provenance" : "Show provenance"], ["share", "Share"], ["submit", "Submit for review"], ["privacy", "Privacy choices"], ["rename", "Rename"], ["shortcuts", "Shortcuts"]] as [MenuAction, string][]).map(([a, l]) => (
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
      <TextPromptDialog open={dialog === "rename"} onClose={() => setDialog(null)} title="Rename thesis" initial={thesis.title} onSubmit={(t) => updateThesis({ title: t }, "Renamed")} submitLabel="Rename" />
      <TextPromptDialog open={dialog === "saveVersion"} onClose={() => setDialog(null)} title="Name this version" label="e.g. Draft sent to advisor" onSubmit={async (label) => { await saveNow(); await api(`/api/theses/${thesisId}/versions`, { method: "POST", json: { label } }).catch(() => {}); notify("Version saved", "success"); loadVersions(); }} submitLabel="Save version" />
      <ConfirmDialog open={dialog === "submit"} onClose={() => setDialog(null)} title="Submit for review" body={<>Your advisor <strong>{thesis.professorName}</strong> will be notified and will see the document, your provenance report and writing sessions. You can keep editing until they approve it.</>} confirmLabel="Submit" onConfirm={async () => { await saveNow(); updateThesis({ status: "under_review" }, "Submitted for review"); }} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} />
      <Modal open={dialog === "about"} onClose={() => setDialog(null)} title="About Thesisfy" size="sm" footer={<button onClick={() => setDialog(null)} className="btn-primary !py-2 !px-4 text-sm">Close</button>}>
        <p className="text-sm text-gray-600">Thesisfy regulates AI use while you write instead of guessing afterwards. Everything you insert from an AI tool is marked, every session is logged according to your consent, and your advisor sees a provenance report instead of a “probability of AI” score.</p>
      </Modal>
      <VersionPreviewDialog open={!!preview} onClose={() => setPreview(null)} html={preview?.html || ""} label={preview?.label || ""} canRestore={canEdit} onRestore={async () => { if (!preview) return; const d = await api<{ thesis: ThesisDoc }>(`/api/theses/${thesisId}/versions/${preview.id}`, { method: "POST" }).catch(() => null); if (d) { editor.commands.setContent(d.thesis.content); setThesis((t) => ({ ...t, ...d.thesis })); loadVersions(); } }} />
      <PasteAttributionDialog open={!!paste} words={paste?.words || 0} matched={paste?.matched || null} onDecide={decidePaste} />
      {me?.policy && (
        <ConsentModal open={dialog === "consent"} onClose={() => setDialog(null)} policy={me.policy} existing={me.consent} thesisId={thesisId} onGranted={async () => { await refreshMe(); if (!monitorRef.current) startSession(); else notify("Monitoring choices updated. They apply from your next session.", "success"); }} />
      )}
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}
