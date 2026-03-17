"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


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

interface WritingReport {
  id: string;
  thesisId: string;
  thesisTitle?: string;
  studentName?: string;
  generatedAt: string;
  totalWritingTime: number;
  totalSessions: number;
  wordsPerSession: number[];
  pasteEvents: PasteEvent[];
  aiUsageSummary: { category: string; count: number; percentage: number }[];
  keystrokePatterns: { hour: number; keystrokes: number }[];
  integrityScore: number;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export default function WritingReportPage() {
  const [report, setReport] = useState<WritingReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/writing-report?thesisId=thesis_1")
      .then((res) => res.json())
      .then((data) => {
        if (data.report) setReport(data.report);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <DashboardLayout navItems={adminNavItems}>
        <div className="animate-fade-in">
          <div className="card p-10 text-center text-gray-500">Loading report...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout navItems={adminNavItems}>
        <div className="animate-fade-in">
          <div className="card p-10 text-center text-gray-500">No report found.</div>
        </div>
      </DashboardLayout>
    );
  }

  const avgWordsPerSession =
    report.wordsPerSession.length > 0
      ? Math.round(report.wordsPerSession.reduce((a, b) => a + b, 0) / report.wordsPerSession.length)
      : 0;

  const maxKeystroke = Math.max(...report.keystrokePatterns.map((k) => k.keystrokes), 1);
  const maxWordsSession = Math.max(...report.wordsPerSession, 1);
  const maxAiCount = Math.max(...report.aiUsageSummary.map((a) => a.count), 1);

  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in">
        {/* Report Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Writing Report</h1>
          <p className="text-gray-500 mt-1">Comprehensive writing analysis and metrics.</p>
        </div>

        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-lg">{report.thesisTitle || "Thesis Report"}</h2>
              <p className="text-sm text-gray-500">Student: {report.studentName || "Unknown"}</p>
            </div>
            <div className="text-sm text-gray-400">
              Generated: {new Date(report.generatedAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-brand-700">{formatTime(report.totalWritingTime)}</div>
            <div className="text-sm text-gray-500">Total Writing Time</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-brand-700">{report.totalSessions}</div>
            <div className="text-sm text-gray-500">Total Sessions</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-brand-700">{avgWordsPerSession}</div>
            <div className="text-sm text-gray-500">Words per Session (avg)</div>
          </div>
          <div className="card p-5 text-center">
            <div className={`text-2xl font-bold ${report.integrityScore >= 80 ? "text-green-600" : report.integrityScore >= 60 ? "text-amber-600" : "text-red-600"}`}>
              {report.integrityScore}%
            </div>
            <div className="text-sm text-gray-500">Integrity Score</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* AI Usage Breakdown */}
          <div className="card p-5">
            <h3 className="font-semibold mb-4">AI Usage Breakdown</h3>
            <div className="space-y-3">
              {report.aiUsageSummary.map((item) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{item.category}</span>
                    <span className="text-gray-500">{item.count} ({item.percentage}%)</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all"
                      style={{ width: `${(item.count / maxAiCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keystroke Activity by Hour */}
          <div className="card p-5">
            <h3 className="font-semibold mb-4">Keystroke Activity by Hour</h3>
            <div className="flex items-end gap-2 h-40">
              {report.keystrokePatterns.map((k) => (
                <div key={k.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-gray-500">{k.keystrokes}</div>
                  <div
                    className="w-full bg-accent-500 rounded-t-md transition-all"
                    style={{ height: `${(k.keystrokes / maxKeystroke) * 100}%` }}
                  />
                  <div className="text-xs text-gray-400">{k.hour}:00</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Words per Session Chart */}
        <div className="card p-5 mb-8">
          <h3 className="font-semibold mb-4">Words per Session</h3>
          <div className="flex items-end gap-2 h-40">
            {report.wordsPerSession.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs text-gray-500">{w}</div>
                <div
                  className="w-full bg-brand-400 rounded-t-md transition-all"
                  style={{ height: `${(w / maxWordsSession) * 100}%` }}
                />
                <div className="text-xs text-gray-400">S{i + 1}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Paste Events List */}
        <div className="card mb-8">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold">Paste Events ({report.pasteEvents.length})</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {report.pasteEvents.length === 0 && (
              <div className="p-5 text-center text-gray-500 text-sm">No paste events recorded.</div>
            )}
            {report.pasteEvents.map((pe) => (
              <div key={pe.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-sm text-gray-500">
                        {new Date(pe.timestamp).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400">
                        {pe.wordCount} words
                      </span>
                      {pe.wasModified ? (
                        <span className="badge-success">Modified</span>
                      ) : (
                        <span className="badge-danger">Unmodified</span>
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 mb-2">
                      {pe.content}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Modification:</span>
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pe.modificationPercent >= 50 ? "bg-green-500" : pe.modificationPercent > 0 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${pe.modificationPercent}%` }}
                          />
                        </div>
                        <span className="text-gray-600">{pe.modificationPercent}%</span>
                      </div>
                      {pe.sourceHint && (
                        <span className="text-gray-400 text-xs">Source: {pe.sourceHint}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
