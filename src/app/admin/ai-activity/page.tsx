"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface ChatLog { id: string; thesisId: string; studentId: string; timestamp: string; userMessage: string; assistantMessage: string; category: string; tokensUsed: number; }
interface Summary { category: string; count: number; totalTokens: number; }

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

const catColors: Record<string, string> = { brainstorming: "bg-purple-500", grammar: "bg-green-500", structure: "bg-blue-500", research: "bg-amber-500", citations: "bg-teal-500", paraphrase: "bg-pink-500", proofreading: "bg-gray-500", other: "bg-gray-400" };
const catBadges: Record<string, string> = { brainstorming: "badge-info", grammar: "badge-success", structure: "badge-info", research: "badge-warning", citations: "badge-success", paraphrase: "badge-warning", proofreading: "badge-info", other: "badge-info" };

export default function AIActivityPage() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [totalInteractions, setTotalInteractions] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-chat-logs")
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setSummary(data.summary || []);
        setTotalInteractions(data.totalInteractions || 0);
        setTotalTokens(data.totalTokens || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const maxCount = summary.length ? Math.max(...summary.map((s) => s.count)) : 1;

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">AI Chat Activity</h1>
          <p className="text-gray-500 mt-1">Detailed report of all AI interactions across student theses.</p>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
              <div className="card p-5 text-center"><div className="text-2xl font-bold">{totalInteractions}</div><div className="text-sm text-gray-500">Total Interactions</div></div>
              <div className="card p-5 text-center"><div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div><div className="text-sm text-gray-500">Total Tokens</div></div>
              <div className="card p-5 text-center"><div className="text-2xl font-bold text-brand-600">{summary.length ? summary.sort((a, b) => b.count - a.count)[0]?.category : "-"}</div><div className="text-sm text-gray-500">Most Used Category</div></div>
              <div className="card p-5 text-center"><div className="text-2xl font-bold">{new Set(logs.map((l) => l.studentId)).size}</div><div className="text-sm text-gray-500">Students Using AI</div></div>
            </div>

            <div className="card p-5 mb-8">
              <h3 className="font-semibold mb-4">Category Breakdown</h3>
              <div className="space-y-3">
                {summary.sort((a, b) => b.count - a.count).map((s) => (
                  <div key={s.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize font-medium">{s.category}</span>
                      <span className="text-gray-500">{s.count} interactions &middot; {s.totalTokens.toLocaleString()} tokens</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div className={`${catColors[s.category] || "bg-gray-400"} h-3 rounded-full`} style={{ width: `${(s.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-semibold">Full Chat History ({logs.length} interactions)</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((log) => (
                  <div key={log.id} className="p-5 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={catBadges[log.category] || "badge-info"}>{log.category}</span>
                      <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                      <span className="text-xs text-gray-400">&middot; {log.tokensUsed} tokens</span>
                    </div>
                    <div className="text-sm text-gray-700 line-clamp-1">{log.userMessage}</div>
                    {expandedLog === log.id && (
                      <div className="mt-3 space-y-2">
                        <div className="bg-gray-100 rounded-lg p-3"><div className="text-xs text-gray-500 mb-1 font-medium">Student:</div><p className="text-sm">{log.userMessage}</p></div>
                        <div className="bg-brand-50 rounded-lg p-3 border border-brand-100"><div className="text-xs text-brand-600 mb-1 font-medium">AI Assistant:</div><p className="text-sm">{log.assistantMessage}</p></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
