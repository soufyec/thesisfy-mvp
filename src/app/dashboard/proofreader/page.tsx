"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

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
    <DashboardLayout navItems={studentNavItems}>
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
