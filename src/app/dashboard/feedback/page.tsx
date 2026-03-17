"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface FeedbackRequest {
  id: string;
  thesisId: string;
  thesisTitle: string;
  professorName: string;
  section: string;
  message: string;
  status: string;
  response?: string;
  createdAt: string;
  respondedAt?: string;
}

interface Thesis {
  id: string;
  title: string;
}


const statusColors: Record<string, string> = {
  pending: "badge-warning",
  reviewed: "badge-success",
  resolved: "badge-info",
};

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRequest[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ thesisId: "", section: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/feedback").then((r) => r.json()),
      fetch("/api/theses").then((r) => r.json()),
    ]).then(([fbData, thData]) => {
      setFeedback(fbData.feedback || []);
      setTheses(thData.theses || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        const thesis = theses.find((t) => t.id === form.thesisId);
        setFeedback((prev) => [{ ...data.feedback, thesisTitle: thesis?.title || "", professorName: "" }, ...prev]);
        setForm({ thesisId: "", section: "", message: "" });
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Feedback</h1>
            <p className="text-gray-500 mt-1">Request and track feedback from your advisor on specific thesis sections.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Request Feedback
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{feedback.length}</div>
            <div className="text-sm text-gray-500">Total Requests</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">{feedback.filter((f) => f.status === "reviewed").length}</div>
            <div className="text-sm text-gray-500">Reviewed</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{feedback.filter((f) => f.status === "pending").length}</div>
            <div className="text-sm text-gray-500">Awaiting Response</div>
          </div>
        </div>

        {/* New Request Form */}
        {showForm && (
          <div className="card p-6 mb-8">
            <h2 className="font-semibold mb-4">Request Feedback</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Thesis</label>
                <select
                  className="input-field"
                  value={form.thesisId}
                  onChange={(e) => setForm({ ...form, thesisId: e.target.value })}
                  required
                >
                  <option value="">Select a thesis...</option>
                  {theses.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Section / Chapter</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Chapter 3 - Methodology"
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">What feedback do you need?</label>
                <textarea
                  className="input-field min-h-[100px]"
                  placeholder="Describe what you'd like your advisor to review or comment on..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Sending..." : "Send Request"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Feedback List */}
        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : feedback.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-gray-400 mb-2">No feedback requests yet</div>
            <p className="text-sm text-gray-400">Request feedback from your advisor on specific sections of your thesis.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {feedback.map((fb) => (
              <div key={fb.id} className="card p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={statusColors[fb.status]}>{fb.status === "pending" ? "Awaiting Response" : fb.status === "reviewed" ? "Reviewed" : "Resolved"}</span>
                      <span className="text-sm font-medium">{fb.section}</span>
                    </div>
                    <div className="text-xs text-gray-400">{fb.thesisTitle} &middot; {new Date(fb.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">Your request:</div>
                  <p className="text-sm text-gray-700">{fb.message}</p>
                </div>

                {fb.response && (
                  <div className="bg-brand-50 rounded-lg p-4 border border-brand-100">
                    <div className="text-xs text-brand-600 mb-1 font-medium">
                      Advisor response &middot; {fb.respondedAt ? new Date(fb.respondedAt).toLocaleDateString() : ""}
                    </div>
                    <p className="text-sm text-gray-700">{fb.response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
