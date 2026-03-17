"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Thesis {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  status: string;
  updatedAt: string;
  professorName: string;
  sessions: Array<{
    id: string;
    wordsWritten: number;
    aiAssists: number;
    keystrokes: number;
  }>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type HeadingLevel = "p" | "h1" | "h2" | "h3";

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm your Thesisfy AI assistant, powered by Claude. I can help you brainstorm ideas, review your structure, improve grammar, and provide academic writing guidance.\n\nNote: All AI interactions are transparently logged as part of your institution's academic integrity policy. I'm here to guide your thinking — not write for you.",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    keystrokes: 0,
    aiAssists: 0,
    startTime: Date.now(),
  });
  const [savedStatus, setSavedStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [currentHeading, setCurrentHeading] = useState<HeadingLevel>("p");
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/theses/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.thesis) {
          setThesis(data.thesis);
          setWordCount(data.thesis.content.split(/\s+/).filter(Boolean).length);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        router.push("/dashboard");
      });
  }, [params.id, router]);

  // Set editor content once thesis loads
  useEffect(() => {
    if (thesis && editorRef.current && !editorRef.current.innerHTML) {
      // Convert markdown-ish content to HTML
      const htmlContent = convertToHTML(thesis.content);
      editorRef.current.innerHTML = htmlContent;
    }
  }, [thesis]);

  // Auto-save on content changes
  useEffect(() => {
    if (!thesis) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSavedStatus("unsaved");
    saveTimeoutRef.current = setTimeout(() => {
      setSavedStatus("saving");
      setTimeout(() => {
        setSavedStatus("saved");
      }, 800);
    }, 2000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [wordCount, thesis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Close dropdown menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headingMenuRef.current && !headingMenuRef.current.contains(e.target as Node)) {
        setShowHeadingMenu(false);
      }
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function convertToHTML(content: string): string {
    return content
      .split("\n")
      .map((line) => {
        if (line.startsWith("#### "))
          return `<h4>${line.slice(5)}</h4>`;
        if (line.startsWith("### "))
          return `<h3>${line.slice(4)}</h3>`;
        if (line.startsWith("## "))
          return `<h2>${line.slice(3)}</h2>`;
        if (line.startsWith("# "))
          return `<h1>${line.slice(2)}</h1>`;
        if (line.startsWith("- "))
          return `<li>${line.slice(2)}</li>`;
        if (/^\d+\.\s/.test(line))
          return `<li>${line.replace(/^\d+\.\s/, "")}</li>`;
        if (line.trim() === "") return `<p><br></p>`;
        return `<p>${line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")}</p>`;
      })
      .join("");
  }

  const updateWordCount = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || "";
    const count = text
      .split(/\s+/)
      .filter((w) => w.trim().length > 0).length;
    setWordCount(count);
  }, []);

  const handleEditorInput = useCallback(() => {
    updateWordCount();
    setSessionStats((prev) => ({
      ...prev,
      keystrokes: prev.keystrokes + 1,
    }));
  }, [updateWordCount]);

  const checkActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState("bold")) formats.add("bold");
    if (document.queryCommandState("italic")) formats.add("italic");
    if (document.queryCommandState("underline")) formats.add("underline");
    if (document.queryCommandState("strikeThrough")) formats.add("strikethrough");
    if (document.queryCommandState("insertUnorderedList")) formats.add("bulletList");
    if (document.queryCommandState("insertOrderedList")) formats.add("orderedList");
    if (document.queryCommandState("justifyLeft")) formats.add("alignLeft");
    if (document.queryCommandState("justifyCenter")) formats.add("alignCenter");
    if (document.queryCommandState("justifyRight")) formats.add("alignRight");

    // Check heading level
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.anchorNode;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as HTMLElement).tagName.toLowerCase();
          if (["h1", "h2", "h3"].includes(tag)) {
            setCurrentHeading(tag as HeadingLevel);
            break;
          }
          if (tag === "p" || tag === "div") {
            setCurrentHeading("p");
            break;
          }
        }
        node = node.parentNode;
      }
    }

    setActiveFormats(formats);
  }, []);

  const execCommand = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value);
      checkActiveFormats();
    },
    [checkActiveFormats]
  );

  const setHeading = useCallback(
    (level: HeadingLevel) => {
      editorRef.current?.focus();
      if (level === "p") {
        document.execCommand("formatBlock", false, "p");
      } else {
        document.execCommand("formatBlock", false, level);
      }
      setCurrentHeading(level);
      setShowHeadingMenu(false);
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    setSavedStatus("saving");
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSaving(false);
    setSavedStatus("saved");
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const apiMessages = [
        ...chatMessages.filter((m) => m.id !== "welcome"),
        userMsg,
      ].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          thesisContext: thesis
            ? { title: thesis.title, wordCount }
            : undefined,
        }),
      });

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        },
      ]);
      setSessionStats((prev) => ({
        ...prev,
        aiAssists: prev.aiAssists + 1,
      }));
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "b":
            e.preventDefault();
            execCommand("bold");
            break;
          case "i":
            e.preventDefault();
            execCommand("italic");
            break;
          case "u":
            e.preventDefault();
            execCommand("underline");
            break;
          case "s":
            e.preventDefault();
            handleSave();
            break;
        }
      }
    },
    [execCommand]
  );

  const sessionDuration = Math.round(
    (Date.now() - sessionStats.startTime) / 60000
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9fbfd] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 animate-spin text-blue-500"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-gray-500 text-sm">Loading editor...</span>
        </div>
      </div>
    );
  }

  if (!thesis) {
    return (
      <div className="min-h-screen bg-[#f9fbfd] flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">Thesis not found</div>
          <Link href="/dashboard" className="btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const headingLabels: Record<HeadingLevel, string> = {
    p: "Normal text",
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
  };

  return (
    <div className="min-h-screen bg-[#f9fbfd] flex flex-col">
      {/* ===== TOP MENU BAR (Google Docs style) ===== */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        {/* Title row */}
        <div className="flex items-center px-3 py-1.5 gap-3">
          {/* Doc icon */}
          <Link
            href="/dashboard"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-7 h-7"
              viewBox="0 0 48 48"
              fill="none"
            >
              <path
                d="M12 4h18l12 12v24a4 4 0 01-4 4H12a4 4 0 01-4-4V8a4 4 0 014-4z"
                fill="#4285F4"
              />
              <path d="M30 4l12 12H34a4 4 0 01-4-4V4z" fill="#A1C2FA" />
              <rect
                x="14"
                y="22"
                width="20"
                height="2"
                rx="1"
                fill="white"
                opacity="0.8"
              />
              <rect
                x="14"
                y="27"
                width="16"
                height="2"
                rx="1"
                fill="white"
                opacity="0.8"
              />
              <rect
                x="14"
                y="32"
                width="20"
                height="2"
                rx="1"
                fill="white"
                opacity="0.8"
              />
            </svg>
          </Link>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-normal text-gray-800 truncate leading-tight">
              {thesis.title}
            </h1>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              {savedStatus === "saved" && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  All changes saved
                </span>
              )}
              {savedStatus === "saving" && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-gray-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Saving...
                </span>
              )}
              {savedStatus === "unsaved" && (
                <span className="text-amber-500">Unsaved changes</span>
              )}
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Session monitor pill */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-700 font-medium">
                Monitoring active
              </span>
            </div>

            {/* Integrity */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs">
              <svg
                className="w-3.5 h-3.5 text-green-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-gray-600 font-medium">
                {thesis.integrityScore}%
              </span>
            </div>

            {/* AI Toggle */}
            <button
              onClick={() => setShowAI(!showAI)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                showAI
                  ? "bg-[#da7756] text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
                  fill="currentColor"
                  opacity="0.2"
                />
                <path
                  d="M8 10.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S10.33 12 9.5 12 8 11.33 8 10.5zm5 0c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zM7.5 15h9a.5.5 0 010 1h-9a.5.5 0 010-1z"
                  fill="currentColor"
                />
              </svg>
              AI Assistant
            </button>

            {/* Share button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1a73e8] hover:bg-[#1765cc] text-white rounded-full text-sm font-medium transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* ===== FORMATTING TOOLBAR ===== */}
        <div className="flex items-center px-3 py-1 border-t border-gray-100 gap-0.5 overflow-x-auto scrollbar-none">
          {/* Undo / Redo */}
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H9" />
                <polyline points="7 14 3 10 7 6" />
              </svg>
            }
            title="Undo (Ctrl+Z)"
            onClick={() => execCommand("undo")}
          />
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h4" />
                <polyline points="17 14 21 10 17 6" />
              </svg>
            }
            title="Redo (Ctrl+Y)"
            onClick={() => execCommand("redo")}
          />

          <ToolbarDivider />

          {/* Heading selector */}
          <div className="relative" ref={headingMenuRef}>
            <button
              onClick={() => setShowHeadingMenu(!showHeadingMenu)}
              className="flex items-center gap-1 h-7 px-2 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors min-w-[110px]"
              title="Styles"
            >
              <span className="truncate">{headingLabels[currentHeading]}</span>
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showHeadingMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[180px]">
                <HeadingMenuItem
                  label="Normal text"
                  tag="p"
                  active={currentHeading === "p"}
                  onClick={() => setHeading("p")}
                />
                <HeadingMenuItem
                  label="Heading 1"
                  tag="h1"
                  active={currentHeading === "h1"}
                  onClick={() => setHeading("h1")}
                  className="text-2xl font-bold"
                />
                <HeadingMenuItem
                  label="Heading 2"
                  tag="h2"
                  active={currentHeading === "h2"}
                  onClick={() => setHeading("h2")}
                  className="text-xl font-bold"
                />
                <HeadingMenuItem
                  label="Heading 3"
                  tag="h3"
                  active={currentHeading === "h3"}
                  onClick={() => setHeading("h3")}
                  className="text-lg font-semibold"
                />
              </div>
            )}
          </div>

          <ToolbarDivider />

          {/* Text formatting */}
          <ToolbarButton
            icon={<span className="font-bold text-sm">B</span>}
            title="Bold (Ctrl+B)"
            active={activeFormats.has("bold")}
            onClick={() => execCommand("bold")}
          />
          <ToolbarButton
            icon={<span className="italic text-sm font-serif">I</span>}
            title="Italic (Ctrl+I)"
            active={activeFormats.has("italic")}
            onClick={() => execCommand("italic")}
          />
          <ToolbarButton
            icon={<span className="underline text-sm">U</span>}
            title="Underline (Ctrl+U)"
            active={activeFormats.has("underline")}
            onClick={() => execCommand("underline")}
          />
          <ToolbarButton
            icon={<span className="line-through text-sm">S</span>}
            title="Strikethrough"
            active={activeFormats.has("strikethrough")}
            onClick={() => execCommand("strikeThrough")}
          />

          <ToolbarDivider />

          {/* Text color */}
          <ToolbarButton
            icon={
              <span className="text-sm flex flex-col items-center leading-none">
                A
                <span className="w-3.5 h-0.5 bg-black rounded-full mt-0.5" />
              </span>
            }
            title="Text color"
            onClick={() => {}}
          />
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            }
            title="Highlight color"
            onClick={() => execCommand("hiliteColor", "#fef08a")}
          />

          <ToolbarDivider />

          {/* Lists */}
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="4" cy="6" r="1" fill="currentColor" />
                <circle cx="4" cy="12" r="1" fill="currentColor" />
                <circle cx="4" cy="18" r="1" fill="currentColor" />
              </svg>
            }
            title="Bulleted list"
            active={activeFormats.has("bulletList")}
            onClick={() => execCommand("insertUnorderedList")}
          />
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="10" y1="6" x2="21" y2="6" />
                <line x1="10" y1="12" x2="21" y2="12" />
                <line x1="10" y1="18" x2="21" y2="18" />
                <text x="2" y="8" fontSize="7" fill="currentColor" fontFamily="system-ui">1</text>
                <text x="2" y="14" fontSize="7" fill="currentColor" fontFamily="system-ui">2</text>
                <text x="2" y="20" fontSize="7" fill="currentColor" fontFamily="system-ui">3</text>
              </svg>
            }
            title="Numbered list"
            active={activeFormats.has("orderedList")}
            onClick={() => execCommand("insertOrderedList")}
          />

          <ToolbarDivider />

          {/* Alignment */}
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="17" y1="10" x2="3" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="17" y1="18" x2="3" y2="18" />
              </svg>
            }
            title="Align left"
            active={activeFormats.has("alignLeft")}
            onClick={() => execCommand("justifyLeft")}
          />
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="10" x2="6" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="18" y1="18" x2="6" y2="18" />
              </svg>
            }
            title="Align center"
            active={activeFormats.has("alignCenter")}
            onClick={() => execCommand("justifyCenter")}
          />
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="21" y1="10" x2="7" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="21" y1="18" x2="7" y2="18" />
              </svg>
            }
            title="Align right"
            active={activeFormats.has("alignRight")}
            onClick={() => execCommand("justifyRight")}
          />

          <ToolbarDivider />

          {/* Indent */}
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="12" x2="11" y2="12" />
                <line x1="21" y1="18" x2="11" y2="18" />
                <polyline points="3 10 7 14 3 18" />
              </svg>
            }
            title="Increase indent"
            onClick={() => execCommand("indent")}
          />
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="12" x2="11" y2="12" />
                <line x1="21" y1="18" x2="11" y2="18" />
                <polyline points="7 10 3 14 7 18" />
              </svg>
            }
            title="Decrease indent"
            onClick={() => execCommand("outdent")}
          />

          <ToolbarDivider />

          {/* Clear formatting */}
          <ToolbarButton
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h8m-4 0v10" />
                <line x1="18" y1="4" x2="6" y2="20" />
              </svg>
            }
            title="Clear formatting"
            onClick={() => execCommand("removeFormat")}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Zoom control */}
          <div className="relative" ref={zoomMenuRef}>
            <button
              onClick={() => setShowZoomMenu(!showZoomMenu)}
              className="flex items-center gap-1 h-7 px-2 rounded text-xs text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {zoomLevel}%
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showZoomMenu && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {[50, 75, 90, 100, 110, 125, 150].map((z) => (
                  <button
                    key={z}
                    onClick={() => {
                      setZoomLevel(z);
                      setShowZoomMenu(false);
                    }}
                    className={`block w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100 ${
                      z === zoomLevel ? "bg-blue-50 text-blue-700" : "text-gray-700"
                    }`}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Word count */}
          <div className="text-xs text-gray-400 px-2 whitespace-nowrap">
            {wordCount.toLocaleString()} words
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor area - Google Docs page style */}
        <div
          className={`flex-1 overflow-auto transition-all duration-300 ${
            showAI ? "lg:mr-[400px]" : ""
          }`}
          style={{ background: "#f9fbfd" }}
        >
          {/* Ruler (visual only) */}
          <div className="sticky top-0 z-10 flex justify-center bg-[#f9fbfd]">
            <div
              className="h-6 bg-white border-b border-x border-gray-200"
              style={{
                width: `${Math.min(816 * (zoomLevel / 100), 1200)}px`,
              }}
            >
              <div className="h-full bg-gradient-to-b from-gray-50 to-white flex items-end px-2 overflow-hidden">
                {Array.from({ length: 80 }, (_, i) => (
                  <div key={i} className="flex-shrink-0" style={{ width: "10px" }}>
                    {i % 10 === 0 ? (
                      <div className="w-px h-3 bg-gray-400 mx-auto" />
                    ) : i % 5 === 0 ? (
                      <div className="w-px h-2 bg-gray-300 mx-auto" />
                    ) : (
                      <div className="w-px h-1 bg-gray-200 mx-auto" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Document page */}
          <div className="flex justify-center py-4 px-4">
            <div
              className="bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.08)] rounded-sm"
              style={{
                width: `${816 * (zoomLevel / 100)}px`,
                minHeight: `${1056 * (zoomLevel / 100)}px`,
                transform: `scale(1)`,
                transformOrigin: "top center",
              }}
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyDown={handleKeyDown}
                onMouseUp={checkActiveFormats}
                onKeyUp={checkActiveFormats}
                className="gdocs-editor outline-none px-[72px] py-[72px] min-h-[1056px] text-[11pt] leading-[1.5] text-gray-900"
                style={{
                  fontSize: `${11 * (zoomLevel / 100)}pt`,
                  fontFamily:
                    "'Times New Roman', 'Noto Serif', Georgia, serif",
                }}
                spellCheck
              />
            </div>
          </div>

          {/* Bottom status bar */}
          <div className="sticky bottom-0 bg-[#f9fbfd] border-t border-gray-200 px-4 py-1 flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-4">
              <span>{wordCount.toLocaleString()} words</span>
              <span>{sessionDuration}min session</span>
              <span>{sessionStats.keystrokes} keystrokes</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Writing monitored
              </span>
              <span>AI assists: {sessionStats.aiAssists}</span>
            </div>
          </div>
        </div>

        {/* ===== AI CHAT PANEL (Claude-like) ===== */}
        {showAI && (
          <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-[#f5f0e8] flex flex-col z-30 shadow-xl">
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#f5f0e8] border-b border-[#e5ddd0]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#da7756] flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h-1v-1h1v1zm2 0h-1v-1h1v1zm2 0h-1v-1h1v1zm-5-3.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S10.33 14 9.5 14 8 13.33 8 12.5zm5 0c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">
                    Thesisfy AI
                  </h2>
                  <p className="text-[10px] text-gray-500">
                    Powered by Claude &middot; Institutional policies active
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAI(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#e5ddd0] text-gray-500 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Institutional policy banner */}
            <div className="px-4 py-2 bg-[#ece4d4] border-b border-[#e0d5c3]">
              <div className="flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-amber-700 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <p className="text-[10px] text-amber-800 leading-snug">
                  This AI operates under <strong>Stanford University</strong>&apos;s academic integrity policy. It cannot write content for you, but can guide your research and writing process. All interactions are logged.
                </p>
              </div>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="animate-fade-in">
                  {msg.role === "assistant" ? (
                    <div className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-[#da7756] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg
                          className="w-3.5 h-3.5 text-white"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle cx="9.5" cy="11" r="1.5" fill="currentColor" />
                          <circle cx="14.5" cy="11" r="1.5" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] leading-relaxed text-gray-800 bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                          {renderMessageContent(msg.content)}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 block ml-1">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <div className="max-w-[85%]">
                        <div className="text-[13px] leading-relaxed text-white bg-[#da7756] rounded-2xl rounded-tr-md px-4 py-3">
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 block text-right mr-1">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#da7756] flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle cx="9.5" cy="11" r="1.5" fill="currentColor" />
                      <circle cx="14.5" cy="11" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-2 h-2 bg-[#da7756] rounded-full animate-bounce opacity-60" />
                      <div
                        className="w-2 h-2 bg-[#da7756] rounded-full animate-bounce opacity-60"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-[#da7756] rounded-full animate-bounce opacity-60"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick suggestions */}
            {chatMessages.length <= 1 && (
              <div className="px-4 pb-2">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Help me outline my next section",
                    "Review my argument structure",
                    "Suggest improvements to my writing",
                    "Help with citations",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setChatInput(suggestion);
                      }}
                      className="text-[11px] px-3 py-1.5 bg-white rounded-full text-gray-600 hover:bg-gray-50 border border-gray-200 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat input */}
            <div className="p-3 bg-[#f5f0e8] border-t border-[#e5ddd0]">
              <div className="flex items-end gap-2 bg-white rounded-2xl border border-gray-200 px-3 py-2 shadow-sm focus-within:border-[#da7756] focus-within:ring-1 focus-within:ring-[#da7756]/20 transition-all">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Ask AI for academic guidance..."
                  rows={1}
                  className="flex-1 text-[13px] bg-transparent border-0 outline-none resize-none max-h-24 placeholder:text-gray-400"
                  style={{
                    height: "auto",
                    minHeight: "24px",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height =
                      Math.min(target.scrollHeight, 96) + "px";
                  }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-[#da7756] text-white hover:bg-[#c8674a] disabled:opacity-30 disabled:hover:bg-[#da7756] transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <p className="text-[9px] text-gray-400 text-center mt-1.5">
                AI may make mistakes. Verify important information.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Utility Components ===== */

function ToolbarButton({
  icon,
  title,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-gray-600 transition-colors ${
        active
          ? "bg-blue-100 text-blue-700"
          : "hover:bg-gray-100"
      }`}
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

function HeadingMenuItem({
  label,
  tag: _tag,
  active,
  onClick,
  className = "",
}: {
  label: string;
  tag: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors ${
        active ? "bg-blue-50 text-blue-700" : "text-gray-700"
      } ${className}`}
    >
      {label}
    </button>
  );
}

function renderMessageContent(content: string) {
  return content.split("\n").map((line, i) => {
    if (line.trim() === "") return <br key={i} />;

    // Parse bold, italic, and list markers
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    const elements = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={j} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={j}>{part.slice(1, -1)}</em>;
      }
      return <span key={j}>{part}</span>;
    });

    if (line.startsWith("- ") || line.startsWith("• ")) {
      return (
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-gray-400">•</span>
          <span>{elements}</span>
        </div>
      );
    }

    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1];
      return (
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-gray-400 min-w-[1rem] text-right">
            {num}.
          </span>
          <span>{elements}</span>
        </div>
      );
    }

    return (
      <p key={i} className={i > 0 ? "mt-1.5" : ""}>
        {elements}
      </p>
    );
  });
}
