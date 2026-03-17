"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

const navItems = [
  { label: "Overview", href: "/admin", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { label: "All Theses", href: "/admin/theses", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> },
  { label: "Students", href: "/admin/students", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { label: "Feedback", href: "/admin/feedback", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg> },
  { label: "Meetings", href: "/admin/meetings", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
  { label: "Milestones", href: "/admin/milestones", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg> },
  { label: "Integrity Flags", href: "/admin/flags", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg> },
  { label: "AI Policies", href: "/admin/policies", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
];

interface Thesis {
  id: string;
  title: string;
}

interface PasteEvent {
  id: string;
  thesisId: string;
  sessionId: string;
  timestamp: string;
  wordCount: number;
  content: string;
  wasModified: boolean;
  modificationPercent: number;
  sourceHint?: string;
}

export default function PasteDetectionPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [selectedThesisId, setSelectedThesisId] = useState("");
  const [pasteEvents, setPasteEvents] = useState<PasteEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch theses list
  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => {
        if (data.theses) setTheses(data.theses);
      })
      .catch(() => {});
  }, []);

  // Fetch paste events when thesis changes
  useEffect(() => {
    if (!selectedThesisId) {
      setPasteEvents([]);
      return;
    }
    setLoading(true);
    fetch(`/api/paste-events?thesisId=${selectedThesisId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.pasteEvents) setPasteEvents(data.pasteEvents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedThesisId]);

  const totalPaste = pasteEvents.length;
  const modifiedCount = pasteEvents.filter((pe) => pe.wasModified).length;
  const unmodifiedCount = totalPaste - modifiedCount;
  const avgModification =
    totalPaste > 0
      ? Math.round(pasteEvents.reduce((sum, pe) => sum + pe.modificationPercent, 0) / totalPaste)
      : 0;

  // Determine word count severity color
  const getWordCountColor = (wc: number): string => {
    if (wc >= 50) return "text-red-600";
    if (wc >= 25) return "text-amber-600";
    return "text-gray-700";
  };

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Paste Detection</h1>
          <p className="text-gray-500 mt-1">Analyze copy/paste events across thesis submissions.</p>
        </div>

        {/* Thesis Selector */}
        <div className="card p-5 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Thesis</label>
          <select
            value={selectedThesisId}
            onChange={(e) => setSelectedThesisId(e.target.value)}
            className="input-field"
          >
            <option value="">-- Choose a thesis --</option>
            {theses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="card p-10 text-center text-gray-500">Loading paste events...</div>
        )}

        {!loading && selectedThesisId && pasteEvents.length === 0 && (
          <div className="card p-10 text-center text-gray-500">No paste events found for this thesis.</div>
        )}

        {!loading && pasteEvents.length > 0 && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card p-5 text-center">
                <div className="text-2xl font-bold text-brand-700">{totalPaste}</div>
                <div className="text-sm text-gray-500">Total Paste Events</div>
              </div>
              <div className="card p-5 text-center">
                <div className="text-2xl font-bold text-green-600">{modifiedCount}</div>
                <div className="text-sm text-gray-500">Modified After Paste</div>
              </div>
              <div className="card p-5 text-center">
                <div className="text-2xl font-bold text-red-600">{unmodifiedCount}</div>
                <div className="text-sm text-gray-500">Unmodified</div>
              </div>
              <div className="card p-5 text-center">
                <div className="text-2xl font-bold text-brand-700">{avgModification}%</div>
                <div className="text-sm text-gray-500">Avg Modification %</div>
              </div>
            </div>

            {/* Paste Event Cards */}
            <div className="space-y-4">
              {pasteEvents.map((pe) => (
                <div key={pe.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-gray-600">
                        {new Date(pe.timestamp).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400">Session: {pe.sessionId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${getWordCountColor(pe.wordCount)}`}>
                        {pe.wordCount}
                      </span>
                      <span className="text-xs text-gray-400">words</span>
                      {pe.wasModified ? (
                        <span className="badge-success">Modified</span>
                      ) : (
                        <span className="badge-danger">Unmodified</span>
                      )}
                    </div>
                  </div>

                  {/* Content Preview */}
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 mb-3">
                    {pe.content}
                  </div>

                  {/* Modification Progress */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-gray-500">Modification:</span>
                    <div className="flex-1 max-w-xs h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pe.modificationPercent >= 50
                            ? "bg-green-500"
                            : pe.modificationPercent > 0
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${pe.modificationPercent}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{pe.modificationPercent}%</span>

                    {pe.sourceHint && (
                      <span className="text-xs text-gray-400 ml-auto">
                        <svg className="w-3 h-3 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                        {pe.sourceHint}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
