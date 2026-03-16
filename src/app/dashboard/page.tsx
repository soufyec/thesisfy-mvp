"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";

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
    label: "Feedback",
    href: "/dashboard/feedback",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
  },
  {
    label: "Meetings",
    href: "/dashboard/meetings",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  },
  {
    label: "Milestones",
    href: "/dashboard/milestones",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg>,
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

export default function StudentDashboard() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => {
        setTheses(data.theses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const activeThesis = theses.find((t) => t.status === "in_progress");

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Welcome back!</h1>
          <p className="text-gray-500 mt-1">Here&apos;s an overview of your academic work.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Total Theses</div>
            <div className="text-2xl font-bold">{theses.length}</div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Avg. Integrity Score</div>
            <div className="text-2xl font-bold text-green-600">
              {theses.length > 0 ? Math.round(theses.reduce((s, t) => s + t.integrityScore, 0) / theses.length) : 0}%
            </div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">AI Usage (Avg)</div>
            <div className="text-2xl font-bold text-blue-600">
              {theses.length > 0 ? Math.round(theses.reduce((s, t) => s + t.aiUsagePercent, 0) / theses.length) : 0}%
            </div>
          </div>
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-1">Total Words</div>
            <div className="text-2xl font-bold">
              {theses.reduce((s, t) => s + t.wordCount, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Active Thesis Highlight */}
        {activeThesis && (
          <div className="card p-6 mb-8 border-l-4 border-l-brand-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-brand-600 mb-1">Currently Working On</div>
                <h3 className="text-lg font-semibold">{activeThesis.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Advisor: {activeThesis.professorName} &middot; {activeThesis.wordCount.toLocaleString()} words
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{activeThesis.integrityScore}%</div>
                  <div className="text-xs text-gray-500">Integrity</div>
                </div>
                <Link href={`/dashboard/editor/${activeThesis.id}`} className="btn-primary whitespace-nowrap">
                  Continue Writing
                </Link>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{activeThesis.wordCount.toLocaleString()} / ~20,000 words</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((activeThesis.wordCount / 20000) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Theses List */}
        <div className="card">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold">Your Theses</h2>
            <Link href="/dashboard/theses" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : theses.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No theses yet. Start your first one!</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {theses.map((thesis) => (
                <Link key={thesis.id} href={`/dashboard/editor/${thesis.id}`} className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{thesis.title}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={statusColors[thesis.status]}>{statusLabels[thesis.status]}</span>
                      <span className="text-xs text-gray-400">{thesis.wordCount.toLocaleString()} words</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 ml-4">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-semibold text-green-600">{thesis.integrityScore}%</div>
                      <div className="text-xs text-gray-400">Integrity</div>
                    </div>
                    <svg className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
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
