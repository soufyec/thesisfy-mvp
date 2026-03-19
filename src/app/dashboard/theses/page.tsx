"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";

interface Thesis {
  id: string;
  title: string;
  description: string;
  status: string;
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  updatedAt: string;
  professorName: string;
}

const statusColors: Record<string, string> = {
  draft: "badge-info",
  in_progress: "badge-warning",
  under_review: "badge-info",
  revision_requested: "badge-danger",
  approved: "badge-success",
  submitted: "badge-success",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  under_review: "Under Review",
  revision_requested: "Revision Needed",
  approved: "Approved",
  submitted: "Submitted",
};

export default function ThesesPage() {
  const router = useRouter();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => {
        setTheses(data.theses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Server error (${res.status}). Please try again.`);
        return;
      }
      const data = await res.json();
      if (data.thesis) {
        router.push(`/dashboard/editor/${data.thesis.id}`);
      } else {
        setError(data.error || "Failed to create thesis");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">My Theses</h1>
            <p className="text-gray-500 mt-1">Manage and track all your thesis projects.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Thesis
          </button>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : theses.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-gray-400 mb-4">No theses yet</div>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>Create Your First Thesis</button>
          </div>
        ) : (
          <div className="grid gap-4">
            {theses.map((thesis) => (
              <Link key={thesis.id} href={`/dashboard/editor/${thesis.id}`} className="card p-6 hover:shadow-lg transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold group-hover:text-brand-600 transition-colors truncate">{thesis.title}</h3>
                      <span className={statusColors[thesis.status]}>{statusLabels[thesis.status]}</span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{thesis.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>Advisor: {thesis.professorName}</span>
                      <span>&middot;</span>
                      <span>{thesis.wordCount.toLocaleString()} words</span>
                      {thesis.deadline && (
                        <>
                          <span>&middot;</span>
                          <span>Due: {new Date(thesis.deadline).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <div className="relative w-14 h-14">
                        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={thesis.integrityScore >= 90 ? "#22c55e" : thesis.integrityScore >= 70 ? "#f59e0b" : "#ef4444"}
                            strokeWidth="3"
                            strokeDasharray={`${thesis.integrityScore}, 100`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                          {thesis.integrityScore}%
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Integrity</div>
                    </div>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Thesis Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold">Create New Thesis</h2>
              <p className="text-sm text-gray-500 mt-1">Start a new thesis project. You can edit all details later.</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Machine Learning Applications in Climate Science"
                  className="input-field"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of your thesis topic and research goals..."
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating || !form.title.trim()} className="btn-primary disabled:opacity-50">
                  {creating ? "Creating..." : "Create & Open Editor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
