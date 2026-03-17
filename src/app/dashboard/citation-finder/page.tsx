"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface Citation {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  volume: string;
  pages: string;
  doi: string;
  formatted: string;
  relevanceScore: number;
}


const quickSuggestions = ["climate models", "deep learning", "neural networks"];

export default function CitationFinderPage() {
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<"APA" | "MLA" | "Chicago">("APA");
  const [results, setResults] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const res = await fetch("/api/citation-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim(), style }),
      });

      if (!res.ok) throw new Error("Failed to fetch citations");

      const data = await res.json();
      setResults(data.citations || []);
    } catch {
      setError("Failed to search for citations. Please try again.");
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

  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return "bg-green-500";
    if (score >= 0.6) return "bg-yellow-500";
    return "bg-gray-400";
  };

  const getRelevanceLabel = (score: number) => {
    if (score >= 0.8) return "High";
    if (score >= 0.6) return "Medium";
    return "Low";
  };

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Citation Finder</h1>
          <p className="text-gray-500 mt-1">
            Search for academic citations and format them in your preferred style.
          </p>
        </div>

        {/* Search Section */}
        <div className="card p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                className="input-field w-full"
                placeholder="Search for academic papers, topics, or authors..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div>
              <select
                className="input-field w-full sm:w-auto"
                value={style}
                onChange={(e) => setStyle(e.target.value as "APA" | "MLA" | "Chicago")}
              >
                <option value="APA">APA</option>
                <option value="MLA">MLA</option>
                <option value="Chicago">Chicago</option>
              </select>
            </div>
            <button
              className="btn-primary flex items-center justify-center gap-2"
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Search
            </button>
          </div>

          {/* Quick Suggestions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">Quick search:</span>
            {quickSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="badge-info cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  setQuery(suggestion);
                  handleSearch(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="card p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" />
            <p className="text-gray-500">Searching academic databases...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card p-6 border-red-200 bg-red-50">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Found {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>
            {results.map((citation) => (
              <div key={citation.id} className="card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-gray-900">{citation.title}</h3>
                    <p className="text-gray-600 mt-1">
                      {citation.authors.join(", ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                      <span>{citation.year}</span>
                      {citation.journal && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="italic">{citation.journal}</span>
                        </>
                      )}
                      {citation.volume && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span>Vol. {citation.volume}, pp. {citation.pages}</span>
                        </>
                      )}
                    </div>
                    {citation.doi && (
                      <a
                        href={`https://doi.org/${citation.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-sm text-brand-600 hover:text-brand-700 underline"
                      >
                        DOI: {citation.doi}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${getRelevanceColor(citation.relevanceScore)}`} />
                    <span className="text-xs text-gray-500">
                      {getRelevanceLabel(citation.relevanceScore)} relevance
                    </span>
                  </div>
                </div>

                {/* Formatted Citation */}
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                    {style} Format
                  </p>
                  <div className="bg-gray-50 rounded p-3 font-mono text-sm text-gray-800 break-words">
                    {citation.formatted}
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    className="btn-secondary text-sm flex items-center gap-2"
                    onClick={() => copyToClipboard(citation.formatted, citation.id)}
                  >
                    {copiedId === citation.id ? (
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
                        Copy Citation
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && results.length === 0 && query === "" && (
          <div className="card p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-600">Search for Citations</h3>
            <p className="text-gray-400 mt-1">
              Enter a topic, paper title, or author name to find academic citations.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
