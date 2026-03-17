"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


interface Criterion {
  name: string;
  description: string;
  maxScore: number;
  currentScore: number;
  weight: number;
  aiEvaluation?: string;
}

interface Rubric {
  id: string;
  title: string;
  thesisId: string;
  thesisTitle: string;
  studentName: string;
  criteria: Criterion[];
}

interface Thesis {
  id: string;
  title: string;
  studentName?: string;
}

interface NewCriterion {
  name: string;
  description: string;
  maxScore: number;
  weight: number;
}

export default function RubricsPage() {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedThesisId, setSelectedThesisId] = useState("");
  const [rubricTitle, setRubricTitle] = useState("");
  const [criteria, setCriteria] = useState<NewCriterion[]>([
    { name: "", description: "", maxScore: 20, weight: 25 },
  ]);

  useEffect(() => {
    fetch("/api/rubrics")
      .then((res) => res.json())
      .then((data) => setRubrics(data.rubrics || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => setTheses(data.theses || []))
      .catch(() => {});
  }, []);

  const addCriterion = () => {
    setCriteria([...criteria, { name: "", description: "", maxScore: 20, weight: 0 }]);
  };

  const updateCriterion = (index: number, field: keyof NewCriterion, value: string | number) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    setCriteria(updated);
  };

  const removeCriterion = (index: number) => {
    if (criteria.length > 1) {
      setCriteria(criteria.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!selectedThesisId || !rubricTitle || criteria.some((c) => !c.name)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thesisId: selectedThesisId,
          title: rubricTitle,
          criteria: criteria.map((c) => ({
            name: c.name,
            description: c.description,
            maxScore: Number(c.maxScore),
            weight: Number(c.weight),
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rubric) {
          setRubrics([data.rubric, ...rubrics]);
        }
        setShowForm(false);
        setRubricTitle("");
        setSelectedThesisId("");
        setCriteria([{ name: "", description: "", maxScore: 20, weight: 25 }]);
      }
    } catch {
      // handle error silently
    } finally {
      setSubmitting(false);
    }
  };

  const computeOverallScore = (rubric: Rubric) => {
    const totalWeight = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = rubric.criteria.reduce(
      (s, c) => s + (c.currentScore / c.maxScore) * c.weight,
      0
    );
    return Math.round((weightedSum / totalWeight) * 100);
  };

  const scoreBarColor = (current: number, max: number) => {
    const pct = (current / max) * 100;
    if (pct >= 80) return "bg-green-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Rubric Evaluator</h1>
            <p className="text-gray-500 mt-1">Create and manage evaluation rubrics for student theses.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Create Rubric"}
          </button>
        </div>

        {/* Create Rubric Form */}
        {showForm && (
          <div className="card p-6 mb-8">
            <h2 className="font-semibold text-lg mb-4">New Rubric</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thesis</label>
                <select
                  className="input-field"
                  value={selectedThesisId}
                  onChange={(e) => setSelectedThesisId(e.target.value)}
                >
                  <option value="">Select a thesis...</option>
                  {theses.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rubric Title</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Final Evaluation Rubric"
                  value={rubricTitle}
                  onChange={(e) => setRubricTitle(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">Criteria</label>
                  <button className="btn-secondary text-sm" onClick={addCriterion}>
                    + Add Criterion
                  </button>
                </div>
                <div className="space-y-3">
                  {criteria.map((c, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-500">Criterion {i + 1}</span>
                        {criteria.length > 1 && (
                          <button
                            className="text-sm text-red-500 hover:text-red-700"
                            onClick={() => removeCriterion(i)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name</label>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="e.g., Research Quality"
                            value={c.name}
                            onChange={(e) => updateCriterion(i, "name", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Description</label>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Describe this criterion"
                            value={c.description}
                            onChange={(e) => updateCriterion(i, "description", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Max Score</label>
                          <input
                            type="number"
                            className="input-field"
                            min={1}
                            value={c.maxScore}
                            onChange={(e) => updateCriterion(i, "maxScore", Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Weight (%)</label>
                          <input
                            type="number"
                            className="input-field"
                            min={0}
                            max={100}
                            value={c.weight}
                            onChange={(e) => updateCriterion(i, "weight", Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button className="btn-outline" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={submitting || !selectedThesisId || !rubricTitle}
                  onClick={handleSubmit}
                >
                  {submitting ? "Creating..." : "Create Rubric"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12 text-gray-400">Loading rubrics...</div>
        )}

        {/* Empty State */}
        {!loading && rubrics.length === 0 && !showForm && (
          <div className="card p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="13" y2="16" />
            </svg>
            <h3 className="font-semibold text-gray-600 mb-1">No rubrics yet</h3>
            <p className="text-sm text-gray-400">Create your first rubric to start evaluating theses.</p>
          </div>
        )}

        {/* Rubric Cards */}
        <div className="space-y-6">
          {rubrics.map((rubric) => {
            const overallScore = computeOverallScore(rubric);
            return (
              <div key={rubric.id} className="card">
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{rubric.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {rubric.thesisTitle} &middot; {rubric.studentName}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold" style={{ color: overallScore >= 80 ? '#16a34a' : overallScore >= 60 ? '#d97706' : '#dc2626' }}>
                        {overallScore}%
                      </div>
                      <div className="text-xs text-gray-400">Overall Score</div>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {rubric.criteria.map((criterion, ci) => {
                    const pct = criterion.maxScore > 0 ? (criterion.currentScore / criterion.maxScore) * 100 : 0;
                    return (
                      <div key={ci} className="border border-gray-100 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{criterion.name}</span>
                            <span className="badge-info text-xs">{criterion.weight}%</span>
                          </div>
                          <span className="text-sm font-semibold">
                            {criterion.currentScore}/{criterion.maxScore}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                          <div
                            className={`${scoreBarColor(criterion.currentScore, criterion.maxScore)} h-2 rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {criterion.aiEvaluation && (
                          <div className="bg-gray-50 rounded-md p-3 mt-2">
                            <p className="text-xs text-gray-600">{criterion.aiEvaluation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
