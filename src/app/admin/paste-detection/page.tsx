"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


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
    <DashboardLayout navItems={adminNavItems}>
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
