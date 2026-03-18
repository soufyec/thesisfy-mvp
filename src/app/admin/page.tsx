"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";

interface Stats {
  total: number;
  inProgress: number;
  underReview: number;
  approved: number;
  avgIntegrity: number;
  avgAiUsage: number;
  totalStudents: number;
  totalProfessors: number;
  totalUsers: number;
  activeSessions: number;
  flagsThisWeek: number;
  avgWordsPerDay: number;
}

interface Thesis {
  id: string;
  title: string;
  status: string;
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  studentName: string;
  professorName: string;
  updatedAt: string;
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

// Student profiles for display
const studentProfiles = [
  { name: "Jane Cooper", initials: "JC", gradient: "bg-gradient-to-br from-rose-400 to-pink-600", university: "Stanford", thesis: "ML Climate Prediction", integrity: 94, aiUsage: 12, status: "active" },
  { name: "Marie Dupont", initials: "MD", gradient: "bg-gradient-to-br from-emerald-400 to-teal-600", university: "Sorbonne", thesis: "AI in French Education", integrity: 96, aiUsage: 8, status: "active" },
  { name: "Alex Thompson", initials: "AT", gradient: "bg-gradient-to-br from-cyan-400 to-blue-600", university: "Stanford", thesis: "Neural Network Optimization", integrity: 88, aiUsage: 22, status: "flagged" },
  { name: "Sofia Rodriguez", initials: "SR", gradient: "bg-gradient-to-br from-violet-400 to-purple-600", university: "Stanford", thesis: "Quantum Computing Ethics", integrity: 97, aiUsage: 5, status: "active" },
];

const recentEvents = [
  { type: "writing", student: "Jane Cooper", initials: "JC", gradient: "bg-gradient-to-br from-rose-400 to-pink-600", message: "Wrote 450 words in Methodology", time: "2h ago" },
  { type: "ai", student: "Marie Dupont", initials: "MD", gradient: "bg-gradient-to-br from-emerald-400 to-teal-600", message: "Used AI assistant for brainstorming", time: "3h ago" },
  { type: "flag", student: "Alex Thompson", initials: "AT", gradient: "bg-gradient-to-br from-cyan-400 to-blue-600", message: "Style inconsistency detected in Section 3", time: "5h ago" },
  { type: "milestone", student: "Jane Cooper", initials: "JC", gradient: "bg-gradient-to-br from-rose-400 to-pink-600", message: "Literature Review milestone approaching (3 days)", time: "1d ago" },
  { type: "feedback", student: "Sofia Rodriguez", initials: "SR", gradient: "bg-gradient-to-br from-violet-400 to-purple-600", message: "Requested feedback on Chapter 1", time: "1d ago" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/theses").then((r) => r.json()),
    ])
      .then(([statsData, thesesData]) => {
        setStats(statsData.stats);
        setTheses(thesesData.theses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <DashboardLayout navItems={adminNavItems}>
        <div className="p-12 text-center text-gray-400">
          <svg className="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading dashboard...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-500 mt-1">
              Monitor academic integrity across your institution.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/feature-toggles" className="btn-outline !py-2 !px-4 text-sm">
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Total Theses</div>
                <div className="text-2xl font-bold">{stats?.total || 0}</div>
              </div>
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <span className="text-green-600 font-medium">{stats?.inProgress || 0} active</span>
              <span className="text-gray-400">&middot;</span>
              <span className="text-blue-600">{stats?.underReview || 0} in review</span>
            </div>
          </div>

          <div className="card p-5 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Avg Integrity</div>
                <div className="text-2xl font-bold text-green-600">
                  {stats?.avgIntegrity || 0}%
                </div>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-green-600 font-medium">
              Above threshold (85%)
            </div>
          </div>

          <div className="card p-5 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Active Students</div>
                <div className="text-2xl font-bold">{stats?.totalStudents || 0}</div>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-gray-500">
                {stats?.activeSessions || 0} writing now
              </span>
            </div>
          </div>

          <div className="card p-5 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Integrity Flags</div>
                <div className="text-2xl font-bold text-amber-600">
                  {stats?.flagsThisWeek || 0}
                </div>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">This week</div>
          </div>
        </div>

        {/* Students + Activity row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Student Profiles */}
          <div className="card p-6 lg:col-span-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Students</h2>
              <span className="text-xs text-gray-400">
                {studentProfiles.length} tracked
              </span>
            </div>
            <div className="space-y-3">
              {studentProfiles.map((student) => (
                <div
                  key={student.name}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-10 h-10 ${student.gradient} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm`}
                  >
                    {student.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {student.name}
                      </span>
                      {student.status === "flagged" && (
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {student.thesis}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`text-sm font-bold ${
                        student.integrity >= 90
                          ? "text-green-600"
                          : student.integrity >= 80
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}
                    >
                      {student.integrity}%
                    </div>
                    <div className="text-[10px] text-gray-400">integrity</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                Live Activity
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              </h2>
              <span className="text-xs text-gray-400">Real-time feed</span>
            </div>
            <div className="space-y-3">
              {recentEvents.map((event, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-8 h-8 ${event.gradient} rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}
                  >
                    {event.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{event.student}</span>
                      <span className="text-gray-500"> &middot; </span>
                      <span className="text-gray-600">{event.message}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          event.type === "writing"
                            ? "bg-blue-50 text-blue-600"
                            : event.type === "ai"
                            ? "bg-purple-50 text-purple-600"
                            : event.type === "flag"
                            ? "bg-amber-50 text-amber-600"
                            : event.type === "milestone"
                            ? "bg-red-50 text-red-600"
                            : "bg-green-50 text-green-600"
                        }`}
                      >
                        {event.type}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {event.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Usage + Theses Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* AI Usage Distribution */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">AI Usage Distribution</h2>
            <div className="space-y-4">
              {[
                { range: "0-10%", count: 1, percent: 33, color: "bg-green-500", label: "Low usage" },
                { range: "10-20%", count: 1, percent: 33, color: "bg-blue-500", label: "Moderate" },
                { range: "20-30%", count: 1, percent: 33, color: "bg-amber-500", label: "High" },
                { range: "30%+", count: 0, percent: 0, color: "bg-red-500", label: "Very high" },
              ].map((item) => (
                <div key={item.range}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.range}</span>
                    <span className="text-gray-400">{item.count} theses</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${item.color} h-2 rounded-full transition-all`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats?.avgAiUsage || 0}%
              </div>
              <div className="text-xs text-gray-500">Average AI usage</div>
            </div>
          </div>

          {/* All Theses */}
          <div className="card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">All Theses</h2>
              <Link
                href="/admin/writing-report"
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                View reports
              </Link>
            </div>
            <div className="space-y-3">
              {theses.map((thesis) => (
                <div
                  key={thesis.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    {/* Student avatar */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        thesis.studentName === "Jane Cooper"
                          ? "bg-gradient-to-br from-rose-400 to-pink-600"
                          : thesis.studentName === "Marie Dupont"
                          ? "bg-gradient-to-br from-emerald-400 to-teal-600"
                          : "bg-gradient-to-br from-gray-400 to-gray-600"
                      }`}
                    >
                      {thesis.studentName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div className="text-sm font-medium truncate">
                        {thesis.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {thesis.studentName}
                        </span>
                        <span
                          className={`text-xs ${statusColors[thesis.status]}`}
                        >
                          {statusLabels[thesis.status]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      <div
                        className={`text-sm font-bold ${
                          thesis.integrityScore >= 90
                            ? "text-green-600"
                            : thesis.integrityScore >= 70
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {thesis.integrityScore}%
                      </div>
                      <div className="text-xs text-gray-400">integrity</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-blue-600">
                        {thesis.aiUsagePercent}%
                      </div>
                      <div className="text-xs text-gray-400">AI use</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Institution Policies */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Active AI Policies</h2>
            <Link
              href="/admin/feature-toggles"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Edit Policies
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <div className="text-sm font-medium text-green-800">
                  Max AI Usage
                </div>
              </div>
              <div className="text-2xl font-bold text-green-700">25%</div>
              <div className="text-xs text-green-600 mt-1">Per thesis</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <div className="text-sm font-medium text-blue-800">
                  AI Tools
                </div>
              </div>
              <div className="text-2xl font-bold text-blue-700">Regulated</div>
              <div className="text-xs text-blue-600 mt-1">
                Thesisfy AI only
              </div>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                <div className="text-sm font-medium text-amber-800">
                  Flag Threshold
                </div>
              </div>
              <div className="text-2xl font-bold text-amber-700">Medium</div>
              <div className="text-xs text-amber-600 mt-1">
                3+ violations
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
