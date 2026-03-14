"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";

interface Thesis {
  id: string;
  title: string;
  description: string;
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

export default function ThesesPage() {
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

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">My Theses</h1>
            <p className="text-gray-500 mt-1">Manage and track all your thesis projects.</p>
          </div>
          <button className="btn-primary">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Thesis
          </button>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : theses.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-gray-400 mb-4">No theses yet</div>
            <button className="btn-primary">Create Your First Thesis</button>
          </div>
        ) : (
          <div className="grid gap-4">
            {theses.map((thesis) => (
              <Link key={thesis.id} href={`/dashboard/editor/${thesis.id}`} className="card p-6 hover:shadow-lg transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold group-hover:text-brand-600 transition-colors truncate">{thesis.title}</h3>
                      <span className={statusColors[thesis.status]}>{statusLabels[thesis.status]}</span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{thesis.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>Advisor: {thesis.professorName}</span>
                      <span>&middot;</span>
                      <span>{thesis.wordCount.toLocaleString()} words</span>
                      {thesis.deadline && (
                        <>
                          <span>&middot;</span>
                          <span>Due: {new Date(thesis.deadline).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <div className="relative w-14 h-14">
                        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={thesis.integrityScore >= 90 ? "#22c55e" : thesis.integrityScore >= 70 ? "#f59e0b" : "#ef4444"}
                            strokeWidth="3"
                            strokeDasharray={`${thesis.integrityScore}, 100`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                          {thesis.integrityScore}%
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Integrity</div>
                    </div>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
