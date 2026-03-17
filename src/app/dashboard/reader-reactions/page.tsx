"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

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

interface Reaction {
  type: "strength" | "gap" | "question" | "suggestion" | "flow" | "clarity" | "missing_info";
  severity: "info" | "warning" | "suggestion";
  message: string;
}

interface SectionReactions {
  sectionName: string;
  reactions: Reaction[];
}

interface Thesis {
  id: string;
  title: string;
}

const reactionIcon = (type: Reaction["type"]) => {
  switch (type) {
    case "strength":
      return (
        <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "gap":
    case "question":
      return (
        <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "suggestion":
      return (
        <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="9" y1="18" x2="15" y2="18" />
          <line x1="10" y1="22" x2="14" y2="22" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
      );
    case "flow":
    case "clarity":
      return (
        <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "missing_info":
      return (
        <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    default:
      return null;
  }
};

const severityBadge = (severity: Reaction["severity"]) => {
  switch (severity) {
    case "info":
      return "badge-info";
    case "warning":
      return "badge-warning";
    case "suggestion":
      return "badge-success";
    default:
      return "badge-info";
  }
};

export default function ReaderReactionsPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [selectedThesisId, setSelectedThesisId] = useState("");
  const [sections, setSections] = useState<SectionReactions[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => setTheses(data.theses || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedThesisId) {
      setSections([]);
      return;
    }
    setLoading(true);
    fetch(`/api/reader-reactions?thesisId=${selectedThesisId}`)
      .then((res) => res.json())
      .then((data) => setSections(data.sections || []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, [selectedThesisId]);

  const allReactions = sections.flatMap((s) => s.reactions);
  const totalReactions = allReactions.length;
  const infoCount = allReactions.filter((r) => r.severity === "info").length;
  const warningCount = allReactions.filter((r) => r.severity === "warning").length;
  const suggestionCount = allReactions.filter((r) => r.severity === "suggestion").length;

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 2000);
  };

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Reader Reactions</h1>
          <p className="text-gray-500 mt-1">AI-predicted reader reactions for each section of your thesis.</p>
        </div>

        {/* Thesis Selector */}
        <div className="card p-5 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Thesis</label>
          <select
            className="input-field"
            value={selectedThesisId}
            onChange={(e) => setSelectedThesisId(e.target.value)}
          >
            <option value="">Choose a thesis...</option>
            {theses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">Loading reactions...</div>
        )}

        {selectedThesisId && !loading && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold">{totalReactions}</div>
                <div className="text-xs text-gray-500">Total Reactions</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{infoCount}</div>
                <div className="text-xs text-gray-500">Info</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-amber-600">{warningCount}</div>
                <div className="text-xs text-gray-500">Warnings</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{suggestionCount}</div>
                <div className="text-xs text-gray-500">Suggestions</div>
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-end mb-6">
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="16" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  "Generate New Analysis"
                )}
              </button>
            </div>

            {/* Section Cards */}
            {sections.length === 0 && !loading && (
              <div className="card p-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <h3 className="font-semibold text-gray-600 mb-1">No reactions yet</h3>
                <p className="text-sm text-gray-400">Click &quot;Generate New Analysis&quot; to get AI-predicted reader reactions.</p>
              </div>
            )}

            <div className="space-y-6">
              {sections.map((section, si) => (
                <div key={si} className="card">
                  <div className="p-5 border-b border-gray-100">
                    <h3 className="font-semibold">{section.sectionName}</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {section.reactions.map((reaction, ri) => (
                      <div key={ri} className="p-4 flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {reactionIcon(reaction.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={severityBadge(reaction.severity)}>
                              {reaction.severity}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{reaction.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                Reactions are AI-generated predictions. Discuss with your advisor for definitive feedback.
              </p>
            </div>
          </>
        )}

        {!selectedThesisId && !loading && (
          <div className="card p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <h3 className="font-semibold text-gray-600 mb-1">Select a thesis</h3>
            <p className="text-sm text-gray-400">Choose a thesis above to view AI-predicted reader reactions.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
