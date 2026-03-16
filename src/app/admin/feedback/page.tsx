"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface FeedbackRequest {
  id: string;
  thesisId: string;
  thesisTitle: string;
  studentName: string;
  professorName: string;
  section: string;
  message: string;
  status: string;
  response?: string;
  createdAt: string;
  respondedAt?: string;
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
  pending: "badge-warning",
  reviewed: "badge-success",
  resolved: "badge-info",
};

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data) => {
        setFeedback(data.feedback || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRespond = (fbId: string) => {
    // In a real app this would call an API
    setFeedback((prev) =>
      prev.map((f) =>
        f.id === fbId ? { ...f, status: "reviewed", response: responseText, respondedAt: new Date().toISOString() } : f
      )
    );
    setRespondingTo(null);
    setResponseText("");
  };

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Feedback Requests</h1>
          <p className="text-gray-500 mt-1">Review and respond to student feedback requests.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{feedback.length}</div>
            <div className="text-sm text-gray-500">Total Requests</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{feedback.filter((f) => f.status === "pending").length}</div>
            <div className="text-sm text-gray-500">Pending Review</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">{feedback.filter((f) => f.status === "reviewed").length}</div>
            <div className="text-sm text-gray-500">Responded</div>
          </div>
        </div>

        {/* Feedback List */}
        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-4">
            {feedback.map((fb) => (
              <div key={fb.id} className="card p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={statusColors[fb.status]}>{fb.status === "pending" ? "Pending" : fb.status === "reviewed" ? "Reviewed" : "Resolved"}</span>
                      <span className="text-sm font-medium">{fb.section}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {fb.studentName} &middot; {fb.thesisTitle} &middot; {new Date(fb.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {fb.status === "pending" && (
                    <button
                      onClick={() => setRespondingTo(respondingTo === fb.id ? null : fb.id)}
                      className="btn-primary text-sm px-4 py-1.5"
                    >
                      Respond
                    </button>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-3">
                  <div className="text-xs text-gray-500 mb-1 font-medium">Student request:</div>
                  <p className="text-sm text-gray-700">{fb.message}</p>
                </div>

                {/* Response Form */}
                {respondingTo === fb.id && (
                  <div className="border border-brand-200 rounded-lg p-4 mb-3 bg-brand-50">
                    <div className="text-xs text-brand-600 mb-2 font-medium">Your response:</div>
                    <textarea
                      className="input-field min-h-[100px] mb-3"
                      placeholder="Write your feedback for the student..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleRespond(fb.id)} className="btn-primary text-sm" disabled={!responseText.trim()}>
                        Send Feedback
                      </button>
                      <button onClick={() => { setRespondingTo(null); setResponseText(""); }} className="btn-outline text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {fb.response && (
                  <div className="bg-brand-50 rounded-lg p-4 border border-brand-100">
                    <div className="text-xs text-brand-600 mb-1 font-medium">
                      Your response &middot; {fb.respondedAt ? new Date(fb.respondedAt).toLocaleDateString() : ""}
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
