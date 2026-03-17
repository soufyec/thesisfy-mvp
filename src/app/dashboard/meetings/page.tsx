"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface Meeting {
  id: string;
  thesisId: string;
  thesisTitle: string;
  professorName: string;
  title: string;
  description: string;
  proposedDate: string;
  duration: number;
  status: string;
  location?: string;
  calendarLink?: string;
}

interface Thesis {
  id: string;
  title: string;
}


const statusColors: Record<string, string> = {
  pending: "badge-warning",
  confirmed: "badge-success",
  declined: "badge-danger",
  completed: "badge-info",
};

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ thesisId: "", title: "", description: "", proposedDate: "", duration: "30" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/meetings").then((r) => r.json()),
      fetch("/api/theses").then((r) => r.json()),
    ]).then(([mData, tData]) => {
      setMeetings(mData.meetings || []);
      setTheses(tData.theses || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, duration: parseInt(form.duration) }),
      });
      if (res.ok) {
        const data = await res.json();
        const thesis = theses.find((t) => t.id === form.thesisId);
        setMeetings((prev) => [{ ...data.meeting, thesisTitle: thesis?.title || "", professorName: "" }, ...prev]);
        setForm({ thesisId: "", title: "", description: "", proposedDate: "", duration: "30" });
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const generateCalendarUrl = (meeting: Meeting, type: "google" | "outlook") => {
    const start = new Date(meeting.proposedDate);
    const end = new Date(start.getTime() + meeting.duration * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

    if (type === "google") {
      const params = new URLSearchParams({
        action: "TEMPLATE",
        text: meeting.title,
        dates: `${fmt(start)}/${fmt(end)}`,
        details: meeting.description,
        location: meeting.location || "",
      });
      return `https://calendar.google.com/calendar/event?${params}`;
    } else {
      const params = new URLSearchParams({
        path: "/calendar/action/compose",
        rru: "addevent",
        subject: meeting.title,
        startdt: start.toISOString(),
        enddt: end.toISOString(),
        body: meeting.description,
        location: meeting.location || "",
      });
      return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
    }
  };

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Meetings</h1>
            <p className="text-gray-500 mt-1">Schedule and manage meetings with your thesis advisor.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Request Meeting
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{meetings.length}</div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">{meetings.filter((m) => m.status === "confirmed").length}</div>
            <div className="text-sm text-gray-500">Confirmed</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{meetings.filter((m) => m.status === "pending").length}</div>
            <div className="text-sm text-gray-500">Pending</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-blue-600">{meetings.filter((m) => m.status === "completed").length}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
        </div>

        {/* New Meeting Form */}
        {showForm && (
          <div className="card p-6 mb-8">
            <h2 className="font-semibold mb-4">Request a Meeting</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Thesis</label>
                  <select className="input-field" value={form.thesisId} onChange={(e) => setForm({ ...form, thesisId: e.target.value })} required>
                    <option value="">Select a thesis...</option>
                    {theses.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Meeting Title</label>
                  <input type="text" className="input-field" placeholder="e.g., Progress Review" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea className="input-field min-h-[80px]" placeholder="What would you like to discuss?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Proposed Date & Time</label>
                  <input type="datetime-local" className="input-field" value={form.proposedDate} onChange={(e) => setForm({ ...form, proposedDate: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                  <select className="input-field" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Sending..." : "Send Request"}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Meetings List */}
        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-gray-400 mb-2">No meetings scheduled</div>
            <p className="text-sm text-gray-400">Request a meeting with your thesis advisor to discuss your progress.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{meeting.title}</h3>
                      <span className={statusColors[meeting.status]}>{meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{meeting.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        {new Date(meeting.proposedDate).toLocaleString()}
                      </span>
                      <span>&middot; {meeting.duration} min</span>
                      {meeting.location && <span>&middot; {meeting.location}</span>}
                      <span>&middot; {meeting.thesisTitle}</span>
                    </div>
                  </div>

                  {meeting.status === "confirmed" && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <a
                        href={generateCalendarUrl(meeting, "google")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap"
                      >
                        <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Google Calendar
                      </a>
                      <a
                        href={generateCalendarUrl(meeting, "outlook")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline text-xs px-3 py-1.5 whitespace-nowrap"
                      >
                        <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Outlook
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
