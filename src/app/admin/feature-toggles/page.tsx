"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";

interface Feature { id: string; name: string; description: string; category: string; enabled: boolean; }


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
  const categories = Array.from(new Set(features.map((f) => f.category)));

  return (
    <DashboardLayout navItems={adminNavItems}>
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
