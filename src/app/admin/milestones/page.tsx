"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";

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
    <DashboardLayout navItems={adminNavItems}>
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
