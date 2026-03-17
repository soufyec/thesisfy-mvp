"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface Milestone {
  id: string;
  thesisId: string;
  thesisTitle: string;
  title: string;
  description: string;
  dueDate: string;
  expectations: string;
  hasFeedback: boolean;
  status: string;
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

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/milestones")
      .then((r) => r.json())
      .then((data) => {
        setMilestones(data.milestones || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const daysUntil = (date: string) => {
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Milestones</h1>
          <p className="text-gray-500 mt-1">Track your thesis milestones and advisor expectations.</p>
        </div>

        {/* Progress Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-5 text-center">
            <div className="text-2xl font-bold">{milestones.length}</div>
            <div className="text-sm text-gray-500">Total Milestones</div>
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
            <div className="text-2xl font-bold text-blue-600">{milestones.filter((m) => m.status === "upcoming").length}</div>
            <div className="text-sm text-gray-500">Upcoming</div>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : milestones.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-gray-400 mb-2">No milestones set</div>
            <p className="text-sm text-gray-400">Your advisor hasn&apos;t set any milestones yet.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 hidden sm:block" />

            <div className="space-y-6">
              {milestones.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map((ms, i) => {
                const days = daysUntil(ms.dueDate);
                return (
                  <div key={ms.id} className="relative flex gap-4">
                    {/* Timeline dot */}
                    <div className="hidden sm:flex w-12 flex-shrink-0 items-start justify-center pt-6">
                      <div className={`w-4 h-4 rounded-full border-2 z-10 ${
                        ms.status === "completed" ? "bg-green-500 border-green-500" :
                        ms.status === "in_progress" ? "bg-amber-500 border-amber-500" :
                        ms.status === "overdue" ? "bg-red-500 border-red-500" :
                        "bg-white border-gray-300"
                      }`} />
                    </div>

                    <div className="card p-6 flex-1">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400 font-mono">#{i + 1}</span>
                            <h3 className="font-semibold">{ms.title}</h3>
                            <span className={statusColors[ms.status]}>{statusLabels[ms.status]}</span>
                          </div>
                          <p className="text-sm text-gray-600">{ms.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-medium">{new Date(ms.dueDate).toLocaleDateString()}</div>
                          <div className={`text-xs ${days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : "text-gray-400"}`}>
                            {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : `${days} days left`}
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 mb-3">
                        <div className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                          Advisor expectations:
                        </div>
                        <p className="text-sm text-gray-700">{ms.expectations}</p>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>{ms.thesisTitle}</span>
                        {ms.hasFeedback && (
                          <>
                            <span>&middot;</span>
                            <span className="text-brand-600 flex items-center gap-1">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                              Feedback checkpoint
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
