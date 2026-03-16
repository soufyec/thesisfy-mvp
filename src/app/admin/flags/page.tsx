"use client";

import DashboardLayout from "@/components/DashboardLayout";

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
    <DashboardLayout navItems={navItems}>
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
