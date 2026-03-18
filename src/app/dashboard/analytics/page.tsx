"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface ThesisData {
  id: string;
  title: string;
  wordCount: number;
  integrityScore: number;
  aiUsagePercent: number;
  sessions: Array<{
    id: string;
    wordsWritten: number;
    aiAssists: number;
    keystrokes: number;
    pasteEvents: number;
    startedAt: string;
    endedAt?: string;
    integrityFlags: Array<{ type: string; severity: string; description: string; timestamp: string; resolved: boolean }>;
  }>;
}

interface WritingReport {
  totalWritingTime: number;
  totalSessions: number;
  wordsPerSession: number[];
  aiUsageSummary: Array<{ category: string; count: number; percentage: number }>;
  keystrokePatterns: Array<{ hour: number; keystrokes: number }>;
  integrityScore: number;
  pasteEvents: Array<{ wordCount: number; wasModified: boolean; modificationPercent: number; sourceHint?: string; timestamp: string }>;
}

export default function AnalyticsPage() {
  const [theses, setTheses] = useState<ThesisData[]>([]);
  const [report, setReport] = useState<WritingReport | null>(null);
  const [selectedThesis, setSelectedThesis] = useState<string>("");

  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => {
        const t = data.theses || [];
        setTheses(t);
        if (t.length > 0) setSelectedThesis(t[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedThesis) return;
    fetch(`/api/writing-report?thesisId=${selectedThesis}`)
      .then((res) => res.json())
      .then((data) => setReport(data.report || null))
      .catch(() => setReport(null));
  }, [selectedThesis]);

  const totalWords = theses.reduce((s, t) => s + t.wordCount, 0);
  const avgIntegrity = theses.length > 0 ? Math.round(theses.reduce((s, t) => s + t.integrityScore, 0) / theses.length) : 0;
  const avgAI = theses.length > 0 ? Math.round(theses.reduce((s, t) => s + t.aiUsagePercent, 0) / theses.length) : 0;
  const totalSessions = report ? report.totalSessions : theses.reduce((s, t) => s + (t.sessions?.length || 0), 0);

  // Build weekly data from sessions
  const allSessions = theses.flatMap(t => t.sessions || []);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeklyWords = [0, 0, 0, 0, 0, 0, 0];
  const weeklyAI = [0, 0, 0, 0, 0, 0, 0];
  allSessions.forEach(s => {
    const day = new Date(s.startedAt).getDay();
    weeklyWords[day] += s.wordsWritten;
    weeklyAI[day] += s.aiAssists;
  });
  const weeklyData = dayNames.map((d, i) => ({ day: d, words: weeklyWords[i], ai: weeklyAI[i] }));
  // Rotate so Mon is first
  const rotated = [...weeklyData.slice(1), weeklyData[0]];
  const maxWords = Math.max(...rotated.map(d => d.words), 1);

  // AI usage from report or fallback
  const aiBreakdown = report?.aiUsageSummary || [
    { category: "Brainstorming", count: 0, percentage: 30 },
    { category: "Grammar & Style", count: 0, percentage: 22 },
    { category: "Structure Help", count: 0, percentage: 19 },
    { category: "Research Guidance", count: 0, percentage: 15 },
  ];
  const aiColors = ["bg-brand-500", "bg-accent-500", "bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"];

  // Integrity flags timeline from sessions
  const allFlags = allSessions
    .flatMap(s => (s.integrityFlags || []).map(f => ({ ...f, sessionId: s.id })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  // Build timeline from sessions + flags
  const timeline = [
    ...allSessions.map(s => ({
      date: new Date(s.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: 0,
      event: `Session: ${s.wordsWritten} words, ${s.aiAssists} AI assists, ${s.keystrokes} keystrokes`,
      type: "session" as const,
    })),
    ...allFlags.map(f => ({
      date: new Date(f.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: 0,
      event: `${f.resolved ? "Resolved" : "Detected"}: ${f.description}`,
      type: f.resolved ? "resolved" as const : "flag" as const,
    })),
  ].sort((a, b) => 0).slice(0, 6);

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Writing Analytics</h1>
            <p className="text-gray-500 mt-1">Track your writing patterns and AI usage over time.</p>
          </div>
          {theses.length > 1 && (
            <select
              value={selectedThesis}
              onChange={e => setSelectedThesis(e.target.value)}
              className="input-field !w-auto !py-2 text-sm"
            >
              {theses.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Total Words Written</div>
            <div className="text-2xl font-bold">{totalWords.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">Across {theses.length} {theses.length === 1 ? "thesis" : "theses"}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Integrity Score</div>
            <div className={`text-2xl font-bold ${avgIntegrity >= 90 ? "text-green-600" : avgIntegrity >= 70 ? "text-amber-600" : "text-red-600"}`}>{avgIntegrity}%</div>
            <div className="text-xs text-gray-500 mt-1">{avgIntegrity >= 90 ? "Excellent standing" : avgIntegrity >= 70 ? "Good standing" : "Needs attention"}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">AI Usage</div>
            <div className="text-2xl font-bold text-blue-600">{avgAI}%</div>
            <div className="text-xs text-gray-500 mt-1">{avgAI <= 20 ? "Within acceptable range" : "Above average usage"}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Writing Sessions</div>
            <div className="text-2xl font-bold">{totalSessions}</div>
            <div className="text-xs text-gray-500 mt-1">{report ? `${report.totalWritingTime} min total` : "Across all theses"}</div>
          </div>
        </div>

        {/* Weekly Writing Activity */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-6">Writing Activity by Day</h2>
          <div className="flex items-end gap-3 h-48">
            {rotated.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col items-center justify-end h-36">
                  {d.words > 0 && <div className="text-xs text-gray-400 mb-1">{d.words}</div>}
                  <div
                    className="w-full bg-brand-500 rounded-t-md transition-all hover:bg-brand-600"
                    style={{ height: `${Math.max((d.words / maxWords) * 100, d.words > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{d.day}</span>
              </div>
            ))}
          </div>
          {rotated.every(d => d.words === 0) && (
            <p className="text-center text-sm text-gray-400 mt-4">No writing sessions recorded yet. Start writing to see your activity here.</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Usage Breakdown */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">AI Usage Breakdown</h2>
            {aiBreakdown.length > 0 ? (
              <div className="space-y-4">
                {aiBreakdown.map((item, i) => (
                  <div key={item.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{item.category}</span>
                      <span className="font-medium">{item.percentage}%{report ? ` (${item.count} uses)` : ""}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`${aiColors[i % aiColors.length]} h-2 rounded-full transition-all`} style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No AI usage data available yet.</p>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Recent Activity</h2>
            {timeline.length > 0 ? (
              <div className="space-y-3">
                {timeline.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="text-xs text-gray-400 w-14 flex-shrink-0 pt-0.5">{item.date}</div>
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      item.type === "session" ? "bg-brand-500" : item.type === "resolved" ? "bg-green-500" : "bg-amber-500"
                    }`} />
                    <div className="text-sm text-gray-600">{item.event}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No activity yet. Start writing to see your timeline here.</p>
            )}
          </div>
        </div>

        {/* Paste Events (from report) */}
        {report && report.pasteEvents.length > 0 && (
          <div className="card p-6 mt-6">
            <h2 className="font-semibold mb-4">Paste Events Detected</h2>
            <div className="space-y-3">
              {report.pasteEvents.map((pe, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pe.wasModified ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
                    {pe.wasModified ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{pe.wordCount} words pasted</div>
                    <div className="text-xs text-gray-500">
                      {pe.wasModified ? `Modified ${pe.modificationPercent}% after paste` : "Not modified"}
                      {pe.sourceHint && <> &middot; Source: {pe.sourceHint}</>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(pe.timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Keystroke Patterns (from report) */}
        {report && report.keystrokePatterns.length > 0 && (
          <div className="card p-6 mt-6">
            <h2 className="font-semibold mb-4">Writing Hours Distribution</h2>
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 24 }, (_, h) => {
                const pattern = report.keystrokePatterns.find(p => p.hour === h);
                const ks = pattern?.keystrokes || 0;
                const maxKs = Math.max(...report.keystrokePatterns.map(p => p.keystrokes), 1);
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-brand-400 rounded-t-sm hover:bg-brand-500 transition-colors"
                      style={{ height: `${Math.max((ks / maxKs) * 100, ks > 0 ? 3 : 0)}%` }}
                      title={`${h}:00 — ${ks} keystrokes`}
                    />
                    {h % 4 === 0 && <span className="text-[9px] text-gray-400">{h}h</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
