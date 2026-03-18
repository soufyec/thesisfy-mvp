"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface Thesis {
  id: string;
  title: string;
  status: string;
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  updatedAt: string;
  professorName: string;
}

const statusColors: Record<string, string> = {
  draft: "badge-info",
  in_progress: "badge-warning",
  under_review: "badge-info",
  revision_requested: "badge-danger",
  approved: "badge-success",
  submitted: "badge-success",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  under_review: "Under Review",
  revision_requested: "Revision Needed",
  approved: "Approved",
  submitted: "Submitted",
};

const recentActivity = [
  { action: "Wrote 450 words", section: "Methodology", time: "2h ago", icon: "pen", color: "text-blue-500 bg-blue-50" },
  { action: "AI assist: brainstorming", section: "Literature Review", time: "3h ago", icon: "ai", color: "text-purple-500 bg-purple-50" },
  { action: "Feedback from Prof. Williams", section: "Chapter 2", time: "1d ago", icon: "feedback", color: "text-green-500 bg-green-50" },
  { action: "Paste event (31 words)", section: "Section 2.1", time: "2d ago", icon: "paste", color: "text-amber-500 bg-amber-50" },
  { action: "Milestone deadline approaching", section: "Literature Review", time: "3d left", icon: "deadline", color: "text-red-500 bg-red-50" },
];

const weeklyWriting = [
  { day: "Mon", words: 320 },
  { day: "Tue", words: 0 },
  { day: "Wed", words: 450 },
  { day: "Thu", words: 280 },
  { day: "Fri", words: 520 },
  { day: "Sat", words: 0 },
  { day: "Sun", words: 380 },
];

export default function StudentDashboard() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const user = JSON.parse(stored);
      setUserName(user.name?.split(" ")[0] || "");
    }

    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => {
        setTheses(data.theses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeThesis = theses.find((t) => t.status === "in_progress");
  const maxWords = Math.max(...weeklyWriting.map((d) => d.words), 1);

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        {/* Welcome Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {userName || "Student"}!
            </h1>
            <p className="text-gray-500 mt-1">
              Here&apos;s an overview of your academic progress.
            </p>
          </div>
          {activeThesis && (
            <Link
              href={`/dashboard/editor/${activeThesis.id}`}
              className="btn-primary whitespace-nowrap group"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Continue Writing
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 group hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
            </div>
            <div className="text-sm text-gray-500 mb-1">Total Theses</div>
            <div className="text-2xl font-bold">{theses.length}</div>
          </div>

          <div className="card p-5 group hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
            </div>
            <div className="text-sm text-gray-500 mb-1">Avg. Integrity</div>
            <div className="text-2xl font-bold text-green-600">
              {theses.length > 0
                ? Math.round(
                    theses.reduce((s, t) => s + t.integrityScore, 0) /
                      theses.length
                  )
                : 0}
              %
            </div>
          </div>

          <div className="card p-5 group hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
            </div>
            <div className="text-sm text-gray-500 mb-1">AI Usage (Avg)</div>
            <div className="text-2xl font-bold text-blue-600">
              {theses.length > 0
                ? Math.round(
                    theses.reduce((s, t) => s + t.aiUsagePercent, 0) /
                      theses.length
                  )
                : 0}
              %
            </div>
          </div>

          <div className="card p-5 group hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
            </div>
            <div className="text-sm text-gray-500 mb-1">Total Words</div>
            <div className="text-2xl font-bold">
              {theses.reduce((s, t) => s + t.wordCount, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Active Thesis Highlight */}
        {activeThesis && (
          <div className="card p-6 mb-8 border-l-4 border-l-brand-500 hover:-translate-y-0.5 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-accent-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-medium text-brand-600 mb-1">
                    Currently Working On
                  </div>
                  <h3 className="text-lg font-semibold">{activeThesis.title}</h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center text-white text-[8px] font-bold">
                        JW
                      </div>
                      <span className="text-sm text-gray-500">
                        {activeThesis.professorName}
                      </span>
                    </div>
                    <span className="text-gray-300">&middot;</span>
                    <span className="text-sm text-gray-500">
                      {activeThesis.wordCount.toLocaleString()} words
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                {/* Integrity circle */}
                <div className="text-center">
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0-31.831"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="3"
                        strokeDasharray={`${activeThesis.integrityScore}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-green-600">
                        {activeThesis.integrityScore}%
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">Integrity</div>
                </div>

                <Link
                  href={`/dashboard/editor/${activeThesis.id}`}
                  className="btn-primary whitespace-nowrap"
                >
                  Open Editor
                </Link>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-5">
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Progress toward goal</span>
                <span>
                  {activeThesis.wordCount.toLocaleString()} / ~20,000 words
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-brand-500 to-accent-500 h-2.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      (activeThesis.wordCount / 20000) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Weekly Writing Chart */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">This Week&apos;s Writing</h2>
            <div className="flex items-end gap-2 h-32">
              {weeklyWriting.map((day) => (
                <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      day.words > 0
                        ? "bg-gradient-to-t from-brand-500 to-brand-400"
                        : "bg-gray-100"
                    }`}
                    style={{
                      height: `${Math.max((day.words / maxWords) * 100, 4)}%`,
                    }}
                  />
                  <span className="text-[10px] text-gray-400">{day.day}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-500">Total this week</span>
              <span className="font-semibold text-brand-600">
                {weeklyWriting.reduce((s, d) => s + d.words, 0).toLocaleString()} words
              </span>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Activity</h2>
              <span className="text-xs text-gray-400">Last 7 days</span>
            </div>
            <div className="space-y-3">
              {recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-9 h-9 ${activity.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    {activity.icon === "pen" && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    )}
                    {activity.icon === "ai" && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    )}
                    {activity.icon === "feedback" && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    )}
                    {activity.icon === "paste" && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                    {activity.icon === "deadline" && (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700">
                      {activity.action}
                    </div>
                    <div className="text-xs text-gray-400">{activity.section}</div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Theses List */}
        <div className="card">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold">Your Theses</h2>
            <Link
              href="/dashboard/theses"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : theses.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No theses yet. Start your first one!
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {theses.map((thesis) => (
                <Link
                  key={thesis.id}
                  href={`/dashboard/editor/${thesis.id}`}
                  className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        thesis.status === "in_progress"
                          ? "bg-gradient-to-br from-brand-500 to-accent-500"
                          : thesis.status === "under_review"
                          ? "bg-gradient-to-br from-blue-400 to-blue-600"
                          : "bg-gray-100"
                      }`}
                    >
                      <svg
                        className={`w-5 h-5 ${
                          thesis.status === "in_progress" || thesis.status === "under_review"
                            ? "text-white"
                            : "text-gray-400"
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm truncate group-hover:text-brand-600 transition-colors">
                        {thesis.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={statusColors[thesis.status]}>
                          {statusLabels[thesis.status]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {thesis.wordCount.toLocaleString()} words
                        </span>
                        <span className="text-xs text-gray-400 hidden sm:inline">
                          Advisor: {thesis.professorName}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 ml-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-semibold text-green-600">
                        {thesis.integrityScore}%
                      </div>
                      <div className="text-xs text-gray-400">Integrity</div>
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
