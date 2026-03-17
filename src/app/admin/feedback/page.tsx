"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";

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
    <DashboardLayout navItems={adminNavItems}>
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
