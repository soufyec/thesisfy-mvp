"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";

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
    <DashboardLayout navItems={adminNavItems}>
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
