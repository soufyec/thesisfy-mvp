"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

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
  deadline?: string;
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
    label: "Integrity Flags",
    href: "/admin/flags",
    icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
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

export default function AdminThesesPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/theses")
      .then((r) => r.json())
      .then((data) => {
        setTheses(data.theses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? theses : theses.filter((t) => t.status === filter);

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">All Theses</h1>
            <p className="text-gray-500 mt-1">Monitor all thesis submissions across the institution.</p>
          </div>
          <div className="flex gap-2">
            {["all", "in_progress", "under_review", "draft"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {f === "all" ? "All" : statusLabels[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left py-3 px-5">Thesis</th>
                  <th className="text-left py-3 px-5">Student</th>
                  <th className="text-left py-3 px-5">Status</th>
                  <th className="text-center py-3 px-5">Integrity</th>
                  <th className="text-center py-3 px-5">AI Usage</th>
                  <th className="text-right py-3 px-5">Words</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((thesis) => (
                  <tr key={thesis.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-5">
                      <div className="text-sm font-medium max-w-xs truncate">{thesis.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Advisor: {thesis.professorName}</div>
                    </td>
                    <td className="py-4 px-5 text-sm text-gray-600">{thesis.studentName}</td>
                    <td className="py-4 px-5">
                      <span className={statusColors[thesis.status]}>{statusLabels[thesis.status]}</span>
                    </td>
                    <td className="py-4 px-5 text-center">
                      <span className={`text-sm font-bold ${thesis.integrityScore >= 90 ? "text-green-600" : thesis.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>
                        {thesis.integrityScore}%
                      </span>
                    </td>
                    <td className="py-4 px-5 text-center text-sm text-blue-600 font-medium">{thesis.aiUsagePercent}%</td>
                    <td className="py-4 px-5 text-right text-sm text-gray-500">{thesis.wordCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
