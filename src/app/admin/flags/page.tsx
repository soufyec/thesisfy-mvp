"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


const flags = [
  {
    id: "flag_1",
    type: "style_inconsistency",
    severity: "low",
    student: "Jane Cooper",
    thesis: "ML in Climate Change Prediction Models",
    description: "Minor style variation detected in paragraph 3 of section 2.2",
    date: "Mar 10, 2026",
    resolved: true,
  },
  {
    id: "flag_2",
    type: "bulk_paste",
    severity: "medium",
    student: "Marie Dupont",
    thesis: "L'impact de l'IA sur l'éducation supérieure",
    description: "Large text block pasted from external source (342 words)",
    date: "Mar 7, 2026",
    resolved: true,
  },
];

const severityColors: Record<string, string> = {
  low: "badge-info",
  medium: "badge-warning",
  high: "badge-danger",
};

const typeLabels: Record<string, string> = {
  bulk_paste: "Bulk Paste",
  ai_generation: "AI Generation",
  style_inconsistency: "Style Inconsistency",
  rapid_typing: "Rapid Typing",
  external_source: "External Source",
};

export default function FlagsPage() {
  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Integrity Flags</h1>
          <p className="text-gray-500 mt-1">Review and manage flagged writing behaviors.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{flags.length}</div>
            <div className="text-sm text-gray-500">Total Flags</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">{flags.filter((f) => f.resolved).length}</div>
            <div className="text-sm text-gray-500">Resolved</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{flags.filter((f) => !f.resolved).length}</div>
            <div className="text-sm text-gray-500">Pending Review</div>
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold">Flag History</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {flags.map((flag) => (
              <div key={flag.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={severityColors[flag.severity]}>{flag.severity.toUpperCase()}</span>
                      <span className="text-sm font-medium">{typeLabels[flag.type]}</span>
                      {flag.resolved && <span className="badge-success">Resolved</span>}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{flag.description}</p>
                    <div className="text-xs text-gray-400">
                      {flag.student} &middot; {flag.thesis} &middot; {flag.date}
                    </div>
                  </div>
                  <button className="text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
