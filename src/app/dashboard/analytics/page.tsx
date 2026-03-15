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
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>,
  },
];

const weeklyData = [
  { day: "Mon", words: 320, ai: 2 },
  { day: "Tue", words: 450, ai: 3 },
  { day: "Wed", words: 180, ai: 1 },
  { day: "Thu", words: 560, ai: 5 },
  { day: "Fri", words: 390, ai: 2 },
  { day: "Sat", words: 210, ai: 0 },
  { day: "Sun", words: 480, ai: 4 },
];

const maxWords = Math.max(...weeklyData.map((d) => d.words));

export default function AnalyticsPage() {
  const [theses, setTheses] = useState<Array<{ id: string; title: string; wordCount: number; integrityScore: number; aiUsagePercent: number }>>([]);

  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => setTheses(data.theses || []))
      .catch(() => {});
  }, []);

  const totalWords = theses.reduce((s, t) => s + t.wordCount, 0);
  const avgIntegrity = theses.length > 0 ? Math.round(theses.reduce((s, t) => s + t.integrityScore, 0) / theses.length) : 0;
  const avgAI = theses.length > 0 ? Math.round(theses.reduce((s, t) => s + t.aiUsagePercent, 0) / theses.length) : 0;

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Writing Analytics</h1>
          <p className="text-gray-500 mt-1">Track your writing patterns and AI usage over time.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Total Words Written</div>
            <div className="text-2xl font-bold">{totalWords.toLocaleString()}</div>
            <div className="text-xs text-green-600 mt-1">+12% vs last month</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Integrity Score</div>
            <div className="text-2xl font-bold text-green-600">{avgIntegrity}%</div>
            <div className="text-xs text-green-600 mt-1">Excellent standing</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">AI Usage</div>
            <div className="text-2xl font-bold text-blue-600">{avgAI}%</div>
            <div className="text-xs text-gray-500 mt-1">Within acceptable range</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Writing Sessions</div>
            <div className="text-2xl font-bold">24</div>
            <div className="text-xs text-gray-500 mt-1">This month</div>
          </div>
        </div>

        {/* Weekly Writing Activity */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-6">Weekly Writing Activity</h2>
          <div className="flex items-end gap-3 h-48">
            {weeklyData.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col items-center justify-end h-36">
                  <div className="text-xs text-gray-400 mb-1">{d.words}</div>
                  <div
                    className="w-full bg-brand-500 rounded-t-md transition-all hover:bg-brand-600"
                    style={{ height: `${(d.words / maxWords) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Usage Breakdown */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">AI Usage Breakdown</h2>
            <div className="space-y-4">
              {[
                { label: "Brainstorming", percent: 35, color: "bg-brand-500" },
                { label: "Grammar & Style", percent: 28, color: "bg-accent-500" },
                { label: "Structure Help", percent: 22, color: "bg-blue-500" },
                { label: "Research Guidance", percent: 15, color: "bg-purple-500" },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-medium">{item.percent}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Integrity Timeline */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Integrity Score Timeline</h2>
            <div className="space-y-3">
              {[
                { date: "Mar 14", score: 94, event: "Session completed - 450 words" },
                { date: "Mar 12", score: 93, event: "Style flag resolved" },
                { date: "Mar 10", score: 91, event: "Minor style inconsistency detected" },
                { date: "Mar 8", score: 92, event: "Session completed - 380 words" },
                { date: "Mar 5", score: 90, event: "New section started" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="text-xs text-gray-400 w-16 flex-shrink-0">{item.date}</div>
                  <div className={`w-10 h-6 rounded flex items-center justify-center text-xs font-bold ${item.score >= 90 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {item.score}
                  </div>
                  <div className="text-sm text-gray-600">{item.event}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
