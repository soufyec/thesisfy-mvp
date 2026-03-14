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
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "I'm your writing assistant. I can help you brainstorm, review structure, or improve your writing. What do you need help with?",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [sessionStats, setSessionStats] = useState({ keystrokes: 0, aiAssists: 0, startTime: Date.now() });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/theses/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.thesis) {
          setThesis(data.thesis);
          setContent(data.thesis.content);
          setWordCount(data.thesis.content.split(/\s+/).filter(Boolean).length);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        router.push("/dashboard");
      });
  }, [params.id, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setWordCount(newContent.split(/\s+/).filter(Boolean).length);
    setSessionStats((prev) => ({ ...prev, keystrokes: prev.keystrokes + 1 }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // Simulate save (in real app, would call API)
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSaving(false);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const apiMessages = [...chatMessages.filter((m) => m.id !== "welcome"), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          thesisContext: thesis ? { title: thesis.title, wordCount } : undefined,
        }),
      });

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: data.message },
      ]);
      setSessionStats((prev) => ({ ...prev, aiAssists: prev.aiAssists + 1 }));
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "assistant", content: "Sorry, something went wrong." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const sessionDuration = Math.round((Date.now() - sessionStats.startTime) / 60000);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading editor...</div>
      </div>
    );
  }

  if (!thesis) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">Thesis not found</div>
          <Link href="/dashboard" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Editor Toolbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <div>
            <h1 className="text-sm font-semibold truncate max-w-md">{thesis.title}</h1>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{wordCount.toLocaleString()} words</span>
              <span>&middot;</span>
              <span>Session: {sessionDuration}m</span>
              <span>&middot;</span>
              <span>{sessionStats.keystrokes} keystrokes</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Integrity indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
            <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <span className="text-xs font-medium text-green-700">{thesis.integrityScore}% Integrity</span>
          </div>

          {/* AI Usage indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
            <span className="text-xs font-medium text-blue-700">AI: {thesis.aiUsagePercent}%</span>
          </div>

          {/* AI Toggle */}
          <button
            onClick={() => setShowAI(!showAI)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showAI ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            AI Assistant
          </button>

          <button onClick={handleSave} disabled={saving} className="btn-primary !py-1.5 !px-4 text-xs">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      {/* Session monitoring bar */}
      <div className="bg-brand-50 border-b border-brand-100 px-4 py-1.5 flex items-center justify-center gap-6 text-xs flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-brand-700 font-medium">Session Active</span>
        </div>
        <span className="text-brand-600">Monitoring: Keystrokes, AI Usage, Writing Patterns</span>
        <span className="text-brand-500">AI Assists this session: {sessionStats.aiAssists}</span>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ${showAI ? "lg:mr-96" : ""}`}>
          <div className="flex-1 overflow-auto p-6 lg:p-12">
            <div className="max-w-3xl mx-auto">
              <textarea
                ref={editorRef}
                value={content}
                onChange={handleContentChange}
                className="w-full min-h-[calc(100vh-16rem)] bg-transparent border-0 focus:outline-none text-base leading-relaxed resize-none font-serif"
                placeholder="Start writing your thesis..."
                spellCheck
              />
            </div>
          </div>
        </div>

        {/* AI Panel */}
        {showAI && (
          <div className="fixed right-0 top-[6.5rem] bottom-0 w-96 bg-white border-l border-gray-200 flex flex-col z-30">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gradient-to-br from-brand-500 to-accent-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                </div>
                <div>
                  <div className="text-sm font-semibold">Thesisfy AI</div>
                  <div className="text-xs text-gray-400">Powered by Claude</div>
                </div>
              </div>
              <button onClick={() => setShowAI(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`${msg.role === "user" ? "ml-8" : "mr-4"}`}>
                  <div className={`text-sm leading-relaxed p-3 rounded-xl ${msg.role === "user" ? "bg-brand-600 text-white rounded-br-md" : "bg-gray-50 rounded-bl-md"}`}>
                    {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
                      if (part.startsWith("**") && part.endsWith("**")) {
                        return <strong key={i}>{part.slice(2, -2)}</strong>;
                      }
                      return <span key={i}>{part}</span>;
                    })}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="mr-4">
                  <div className="bg-gray-50 rounded-xl rounded-bl-md p-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="p-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder="Ask AI for help..."
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatLoading} className="btn-primary !p-2 !rounded-lg disabled:opacity-30">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
