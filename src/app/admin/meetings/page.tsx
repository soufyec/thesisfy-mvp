"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";

interface Meeting {
  id: string;
  thesisId: string;
  thesisTitle: string;
  studentName: string;
  professorName: string;
  title: string;
  description: string;
  proposedDate: string;
  duration: number;
  status: string;
  location?: string;
}


const statusColors: Record<string, string> = {
  pending: "badge-warning",
  confirmed: "badge-success",
  declined: "badge-danger",
  completed: "badge-info",
};

export default function AdminMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((data) => {
        setMeetings(data.meetings || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = (meetingId: string, action: "confirmed" | "declined") => {
    setMeetings((prev) =>
      prev.map((m) => (m.id === meetingId ? { ...m, status: action } : m))
    );
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
        details: `${meeting.description}\n\nStudent: ${meeting.studentName}\nThesis: ${meeting.thesisTitle}`,
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
        body: `${meeting.description}\n\nStudent: ${meeting.studentName}\nThesis: ${meeting.thesisTitle}`,
        location: meeting.location || "",
      });
      return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
    }
  };

  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Meeting Requests</h1>
          <p className="text-gray-500 mt-1">Manage and confirm meeting requests from students.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{meetings.length}</div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-amber-600">{meetings.filter((m) => m.status === "pending").length}</div>
            <div className="text-sm text-gray-500">Pending</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-green-600">{meetings.filter((m) => m.status === "confirmed").length}</div>
            <div className="text-sm text-gray-500">Confirmed</div>
          </div>
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold text-blue-600">{meetings.filter((m) => m.status === "completed").length}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
        </div>

        {/* Meetings List */}
        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
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
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                        {meeting.studentName}
                      </span>
                      <span>&middot;</span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        {new Date(meeting.proposedDate).toLocaleString()}
                      </span>
                      <span>&middot; {meeting.duration} min</span>
                      <span>&middot; {meeting.thesisTitle}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {meeting.status === "pending" && (
                      <>
                        <button onClick={() => handleAction(meeting.id, "confirmed")} className="btn-primary text-sm px-4 py-1.5">
                          Confirm
                        </button>
                        <button onClick={() => handleAction(meeting.id, "declined")} className="btn-outline text-sm px-4 py-1.5 text-red-600 border-red-200 hover:bg-red-50">
                          Decline
                        </button>
                      </>
                    )}
                    {meeting.status === "confirmed" && (
                      <>
                        <a href={generateCalendarUrl(meeting, "google")} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap">
                          Google Calendar
                        </a>
                        <a href={generateCalendarUrl(meeting, "outlook")} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs px-3 py-1.5 whitespace-nowrap">
                          Outlook
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
