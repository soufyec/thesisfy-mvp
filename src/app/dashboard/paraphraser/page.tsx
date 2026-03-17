"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface ParaphraseOption {
  id: string;
  text: string;
  style: string;
}

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  },
  {
    label: "My Theses",
    href: "/dashboard/theses",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  },
  {
    label: "AI Assistant",
    href: "/dashboard/ai-chat",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  },
  {
    label: "Feedback",
    href: "/dashboard/feedback",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
  },
  {
    label: "Meetings",
    href: "/dashboard/meetings",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  },
  {
    label: "Milestones",
    href: "/dashboard/milestones",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>,
  },
];

export default function ParaphraserPage() {
  const [inputText, setInputText] = useState("");
  const [style, setStyle] = useState<"Academic" | "Formal" | "Concise">("Academic");
  const [options, setOptions] = useState<ParaphraseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleParaphrase = async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    setError("");
    setOptions([]);
    setCopiedId(null);
    setSelectedId(null);

    try {
      const res = await fetch("/api/paraphraser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText.trim(), style }),
      });

      if (!res.ok) throw new Error("Failed to paraphrase text");

      const data = await res.json();
      setOptions(data.options || []);
    } catch {
      setError("Failed to paraphrase text. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleUseThis = (option: ParaphraseOption) => {
    setInputText(option.text);
    setSelectedId(option.id);
    setTimeout(() => setSelectedId(null), 2000);
  };

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Academic Paraphraser</h1>
          <p className="text-gray-500 mt-1">
            Rewrite your text in different academic styles while preserving the original meaning.
          </p>
        </div>

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input */}
          <div className="space-y-4">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Original Text</label>
                <select
                  className="input-field text-sm py-1.5"
                  value={style}
                  onChange={(e) => setStyle(e.target.value as "Academic" | "Formal" | "Concise")}
                >
                  <option value="Academic">Academic</option>
                  <option value="Formal">Formal</option>
                  <option value="Concise">Concise</option>
                </select>
              </div>
              <textarea
                className="input-field w-full min-h-[300px] resize-y"
                placeholder="Enter the text you want to paraphrase..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-400">
                  {inputText.trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={handleParaphrase}
                  disabled={loading || !inputText.trim()}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Paraphrasing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 1l4 4-4 4" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <path d="M7 23l-4-4 4-4" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      Paraphrase
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Output */}
          <div className="space-y-4">
            {/* Loading State */}
            {loading && (
              <div className="card p-12 text-center">
                <div className="inline-block w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" />
                <p className="text-gray-500">Generating paraphrase options...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="card p-6 border-red-200 bg-red-50">
                <p className="text-red-600">{error}</p>
              </div>
            )}

            {/* Paraphrase Options */}
            {!loading && options.length > 0 && (
              <div className="space-y-4">
                {options.map((option, index) => (
                  <div
                    key={option.id}
                    className={`card p-5 transition-all ${selectedId === option.id ? "ring-2 ring-brand-500" : ""}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-sm font-bold">
                        {index + 1}
                      </span>
                      <span className="badge-info text-xs">{option.style}</span>
                    </div>
                    <p className="text-gray-800 leading-relaxed">{option.text}</p>
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        className="btn-outline text-sm flex items-center gap-1.5"
                        onClick={() => copyToClipboard(option.text, option.id)}
                      >
                        {copiedId === option.id ? (
                          <>
                            <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        className="btn-secondary text-sm flex items-center gap-1.5"
                        onClick={() => handleUseThis(option)}
                      >
                        {selectedId === option.id ? (
                          <>
                            <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Applied!
                          </>
                        ) : (
                          "Use This"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && options.length === 0 && (
              <div className="card p-12 text-center">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 1l4 4-4 4" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 23l-4-4 4-4" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-600">Paraphrase Options</h3>
                <p className="text-gray-400 mt-1">
                  Enter your text on the left and click &ldquo;Paraphrase&rdquo; to see multiple rewriting options.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 p-4 bg-brand-50 rounded-lg border border-brand-100 flex items-start gap-3">
          <svg className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-sm text-brand-700">
            All paraphrasing activity is transparently logged as part of your integrity profile.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
