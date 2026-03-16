"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface Milestone {
  id: string;
  thesisId: string;
  thesisTitle: string;
  studentName: string;
  title: string;
  description: string;
  dueDate: string;
  expectations: string;
  hasFeedback: boolean;
  status: string;
}

interface Thesis {
  id: string;
  title: string;
  studentName: string;
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
  upcoming: "badge-info",
  in_progress: "badge-warning",
  completed: "badge-success",
  overdue: "badge-danger",
};

const statusLabels: Record<string, string> = {
  upcoming: "Upcoming",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
};

export default function AdminMilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    thesisId: "",
    title: "",
    description: "",
    dueDate: "",
    expectations: "",
    hasFeedback: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/milestones").then((r) => r.json()),
      fetch("/api/theses").then((r) => r.json()),
    ]).then(([msData, thData]) => {
      setMilestones(msData.milestones || []);
      setTheses(thData.theses || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        const thesis = theses.find((t) => t.id === form.thesisId);
        setMilestones((prev) => [...prev, { ...data.milestone, thesisTitle: thesis?.title || "", studentName: thesis?.studentName || "" }]);
        setForm({ thesisId: "", title: "", description: "", dueDate: "", expectations: "", hasFeedback: false });
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = (msId: string, newStatus: string) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === msId ? { ...m, status: newStatus } : m))
    );
  };

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Milestones</h1>
            <p className="text-gray-500 mt-1">Set expectations and track student progress through thesis milestones.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Milestone
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{milestones.length}</div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">{milestones.filter((m) => m.status === "completed").length}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{milestones.filter((m) => m.status === "in_progress").length}</div>
            <div className="text-sm text-gray-500">In Progress</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-red-600">{milestones.filter((m) => m.status === "overdue").length}</div>
            <div className="text-sm text-gray-500">Overdue</div>
          </div>
        </div>

        {/* New Milestone Form */}
        {showForm && (
          <div className="card p-6 mb-8">
            <h2 className="font-semibold mb-4">Create Milestone</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Thesis</label>
                  <select className="input-field" value={form.thesisId} onChange={(e) => setForm({ ...form, thesisId: e.target.value })} required>
                    <option value="">Select a thesis...</option>
                    {theses.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.studentName})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input type="date" className="input-field" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Milestone Title</label>
                <input type="text" className="input-field" placeholder="e.g., Literature Review Complete" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input type="text" className="input-field" placeholder="Brief description of this milestone" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expectations for Student</label>
                <textarea
                  className="input-field min-h-[120px]"
                  placeholder="Describe what you expect the student to deliver at this milestone. Be specific about requirements, minimum sources, word count, etc."
                  value={form.expectations}
                  onChange={(e) => setForm({ ...form, expectations: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hasFeedback"
                  checked={form.hasFeedback}
                  onChange={(e) => setForm({ ...form, hasFeedback: e.target.checked })}
                  className="w-4 h-4 text-brand-600 rounded border-gray-300"
                />
                <label htmlFor="hasFeedback" className="text-sm font-medium">This milestone includes a feedback checkpoint</label>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Creating..." : "Create Milestone"}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Milestones by Thesis */}
        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-4">
            {milestones.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map((ms) => {
              const days = Math.ceil((new Date(ms.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={ms.id} className="card p-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{ms.title}</h3>
                        <span className={statusColors[ms.status]}>{statusLabels[ms.status]}</span>
                        {ms.hasFeedback && <span className="badge-info">Feedback Checkpoint</span>}
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{ms.description}</p>
                      <div className="text-xs text-gray-400">
                        {ms.studentName} &middot; {ms.thesisTitle} &middot; Due: {new Date(ms.dueDate).toLocaleDateString()}
                        <span className={`ml-2 ${days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : ""}`}>
                          ({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`})
                        </span>
                      </div>
                    </div>
                    <div>
                      <select
                        className="input-field text-sm py-1.5 px-3"
                        value={ms.status}
                        onChange={(e) => handleStatusChange(ms.id, e.target.value)}
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                      Expectations:
                    </div>
                    <p className="text-sm text-gray-700">{ms.expectations}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
