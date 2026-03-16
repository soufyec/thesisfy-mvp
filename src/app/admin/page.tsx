"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";

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

const navItems = [
  {
    label: "Overview",
    href: "/admin",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  },
  {
    label: "All Theses",
    href: "/admin/theses",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  },
  {
    label: "Students",
    href: "/admin/students",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    label: "Feedback",
    href: "/admin/feedback",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
  },
  {
    label: "Meetings",
    href: "/admin/meetings",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  },
  {
    label: "Milestones",
    href: "/admin/milestones",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
  },
  {
    label: "Integrity Flags",
    href: "/admin/flags",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>,
  },
  {
    label: "AI Policies",
    href: "/admin/policies",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  },
];

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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/theses").then((r) => r.json()),
    ]).then(([statsData, thesesData]) => {
      setStats(statsData.stats);
      setTheses(thesesData.theses || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <DashboardLayout navItems={navItems}>
        <div className="p-12 text-center text-gray-400">Loading dashboard...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Monitor academic integrity across your institution.</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Total Theses</div>
                <div className="text-2xl font-bold">{stats?.total || 0}</div>
              </div>
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs">
              <span className="text-green-600">{stats?.inProgress || 0} active</span>
              <span className="text-gray-400">&middot;</span>
              <span className="text-blue-600">{stats?.underReview || 0} in review</span>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Avg Integrity Score</div>
                <div className="text-2xl font-bold text-green-600">{stats?.avgIntegrity || 0}%</div>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-green-600">Above institution threshold (85%)</div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Active Students</div>
                <div className="text-2xl font-bold">{stats?.totalStudents || 0}</div>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">{stats?.activeSessions || 0} writing right now</div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Integrity Flags</div>
                <div className="text-2xl font-bold text-amber-600">{stats?.flagsThisWeek || 0}</div>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">This week</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* AI Usage Distribution */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4">AI Usage Distribution</h2>
            <div className="space-y-4">
              {[
                { range: "0-10%", count: 1, percent: 33, color: "bg-green-500" },
                { range: "10-20%", count: 1, percent: 33, color: "bg-blue-500" },
                { range: "20-30%", count: 1, percent: 33, color: "bg-amber-500" },
                { range: "30%+", count: 0, percent: 0, color: "bg-red-500" },
              ].map((item) => (
                <div key={item.range}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{item.range}</span>
                    <span className="text-gray-400">{item.count} theses</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats?.avgAiUsage || 0}%</div>
              <div className="text-xs text-gray-500">Average AI usage across all theses</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card p-6 lg:col-span-2">
            <h2 className="font-semibold mb-4">All Theses Overview</h2>
            <div className="space-y-3">
              {theses.map((thesis) => (
                <div key={thesis.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{thesis.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{thesis.studentName}</span>
                      <span className={`text-xs ${statusColors[thesis.status]}`}>{statusLabels[thesis.status]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${thesis.integrityScore >= 90 ? "text-green-600" : thesis.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>
                        {thesis.integrityScore}%
                      </div>
                      <div className="text-xs text-gray-400">integrity</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-blue-600">{thesis.aiUsagePercent}%</div>
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
            <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">Edit Policies</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="text-sm font-medium text-green-800 mb-1">Max AI Usage Allowed</div>
              <div className="text-2xl font-bold text-green-700">25%</div>
              <div className="text-xs text-green-600 mt-1">Per thesis document</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="text-sm font-medium text-blue-800 mb-1">AI Tools Permitted</div>
              <div className="text-2xl font-bold text-blue-700">Regulated</div>
              <div className="text-xs text-blue-600 mt-1">Thesisfy AI assistant only</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="text-sm font-medium text-amber-800 mb-1">Flag Threshold</div>
              <div className="text-2xl font-bold text-amber-700">Medium</div>
              <div className="text-xs text-amber-600 mt-1">Auto-flag at 3+ violations</div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
