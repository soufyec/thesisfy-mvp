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
      <DashboardLayout navItems={navItems}>
        <div className="animate-fade-in">
          <div className="card p-10 text-center text-gray-500">Loading report...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!report) {
    return (
      <DashboardLayout navItems={navItems}>
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
    <DashboardLayout navItems={navItems}>
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
