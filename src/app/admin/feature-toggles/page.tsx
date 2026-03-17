"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";

interface Feature { id: string; name: string; description: string; category: string; enabled: boolean; }

const navItems = [
  { label: "Overview", href: "/admin", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
  { label: "All Theses", href: "/admin/theses", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> },
  { label: "Students", href: "/admin/students", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { label: "Feedback", href: "/admin/feedback", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg> },
  { label: "Meetings", href: "/admin/meetings", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
  { label: "Milestones", href: "/admin/milestones", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg> },
  { label: "Integrity Flags", href: "/admin/flags", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg> },
  { label: "AI Policies", href: "/admin/policies", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
];

const categoryInfo: Record<string, { label: string; description: string }> = {
  writing_tools: { label: "Writing Tools", description: "Tools that assist students with their writing process" },
  ai_tools: { label: "AI Tools", description: "AI-powered features that enhance research and citations" },
  monitoring: { label: "Monitoring", description: "Features that monitor and report on the writing process" },
  evaluation: { label: "Evaluation", description: "Tools for evaluating thesis quality and progress" },
};

export default function FeatureTogglesPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/feature-toggles")
      .then((r) => r.json())
      .then((d) => { setFeatures(d.features || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    setFeatures((prev) => prev.map((f) => f.id === id ? { ...f, enabled } : f));
    await fetch("/api/feature-toggles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    setSavedId(id);
    setTimeout(() => setSavedId(null), 1500);
  };

  const enabledCount = features.filter((f) => f.enabled).length;
  const categories = [...new Set(features.map((f) => f.category))];

  return (
    <DashboardLayout navItems={navItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Feature Management</h1>
          <p className="text-gray-500 mt-1">Control which features are available to students and professors in your institution.</p>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading...</div>
        ) : (
          <>
            <div className="card p-5 mb-8 bg-brand-50 border-brand-200">
              <div className="text-sm font-medium text-brand-700">{enabledCount} of {features.length} features enabled</div>
            </div>

            <div className="space-y-8">
              {categories.map((cat) => {
                const catFeatures = features.filter((f) => f.category === cat);
                const info = categoryInfo[cat] || { label: cat, description: "" };
                return (
                  <div key={cat}>
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold">{info.label}</h2>
                      <p className="text-sm text-gray-500">{info.description}</p>
                    </div>
                    <div className="space-y-3">
                      {catFeatures.map((f) => (
                        <div key={f.id} className="card p-5 flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{f.description.split(" — ")[0]}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{f.description.split(" — ")[1] || f.description}</div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {savedId === f.id && <span className="text-xs text-green-600 font-medium">Saved</span>}
                            <button
                              onClick={() => handleToggle(f.id, !f.enabled)}
                              className={`relative w-12 h-6 rounded-full transition-colors ${f.enabled ? "bg-brand-600" : "bg-gray-300"}`}
                            >
                              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${f.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
