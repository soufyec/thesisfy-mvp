"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface Suggestion {
  id: string;
  category: "Grammar" | "Clarity" | "Tone" | "Conciseness" | "Academic Style";
  original: string;
  replacement: string;
  explanation: string;
  startIndex: number;
  endIndex: number;
}

interface ProofreadResult {
  score: number;
  suggestions: Suggestion[];
  summary: {
    Grammar: number;
    Clarity: number;
    Tone: number;
    Conciseness: number;
    "Academic Style": number;
  };
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

const categoryColors: Record<string, string> = {
  Grammar: "badge-danger",
  Clarity: "badge-warning",
  Tone: "badge-info",
  Conciseness: "badge-success",
  "Academic Style": "bg-purple-100 text-purple-700",
};

export default function ProofreaderPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const handleProofread = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);
    setAppliedIds(new Set());

    try {
      const res = await fetch("/api/proofreader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!res.ok) throw new Error("Failed to proofread text");

      const data = await res.json();
      setResult(data);
    } catch {
      setError("Failed to proofread text. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (suggestion: Suggestion) => {
    const newText = text.replace(suggestion.original, suggestion.replacement);
    setText(newText);
    setAppliedIds((prev) => new Set(prev).add(suggestion.id));
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const scoreStroke = (score: number) => {
    if (score >= 80) return "stroke-green-500";
    if (score >= 60) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  const circumference = 2 * Math.PI * 40;

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Smart Proofreader</h1>
          <p className="text-gray-500 mt-1">
            Paste your academic text below to get AI-powered suggestions for grammar, clarity, and style.
          </p>
        </div>

        {/* Input Section */}
        <div className="card p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Text
          </label>
          <textarea
            className="input-field w-full min-h-[200px] resize-y"
            placeholder="Paste or type your academic text here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-400">
              {text.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleProofread}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Proofreading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Proofread
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="card p-6 border-red-200 bg-red-50 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Score and Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Circular Score */}
              <div className="card p-6 flex flex-col items-center justify-center">
                <p className="text-sm font-medium text-gray-500 mb-4">Overall Writing Score</p>
                <div className="relative w-28 h-28">
                  <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50" cy="50" r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50" cy="50" r="40"
                      fill="none"
                      className={scoreStroke(result.score)}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference - (result.score / 100) * circumference}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${scoreColor(result.score)}`}>
                      {result.score}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-500">out of 100</p>
              </div>

              {/* Category Summary */}
              <div className="card p-6 lg:col-span-2">
                <p className="text-sm font-medium text-gray-500 mb-4">Issues by Category</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Object.entries(result.summary).map(([category, count]) => (
                    <div key={category} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-800">{count}</div>
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${categoryColors[category] || "badge-info"}`}>
                          {category}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-800">
                      {Object.values(result.summary).reduce((a, b) => a + b, 0)}
                    </div>
                    <div className="text-sm text-gray-500">Total Issues</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Suggestions List */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Suggestions</h2>
              {result.suggestions.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-gray-500">No suggestions found. Your text looks great!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {result.suggestions.map((suggestion) => {
                    const isApplied = appliedIds.has(suggestion.id);
                    return (
                      <div key={suggestion.id} className={`card p-5 ${isApplied ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${categoryColors[suggestion.category] || "badge-info"}`}>
                              {suggestion.category}
                            </span>
                            <div className="mt-2 text-sm">
                              <span className="line-through text-red-500 bg-red-50 px-1 rounded">
                                {suggestion.original}
                              </span>
                              <span className="mx-2 text-gray-400">&rarr;</span>
                              <span className="text-green-600 bg-green-50 px-1 rounded">
                                {suggestion.replacement}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-500">{suggestion.explanation}</p>
                          </div>
                          <button
                            className={`shrink-0 ${isApplied ? "btn-outline text-sm cursor-default" : "btn-secondary text-sm"}`}
                            onClick={() => !isApplied && handleApply(suggestion)}
                            disabled={isApplied}
                          >
                            {isApplied ? (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Applied
                              </span>
                            ) : (
                              "Apply"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && !result && (
          <div className="card p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-600">Paste Your Text Above</h3>
            <p className="text-gray-400 mt-1">
              Get AI-powered suggestions to improve grammar, clarity, tone, and academic style.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
