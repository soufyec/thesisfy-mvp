"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { studentNavItems } from "@/lib/nav-items";


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
  criteria: Criterion[];
}

interface Thesis {
  id: string;
  title: string;
}

export default function StudentRubricPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [selectedThesisId, setSelectedThesisId] = useState("");
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/theses")
      .then((res) => res.json())
      .then((data) => setTheses(data.theses || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedThesisId) {
      setRubric(null);
      return;
    }
    setLoading(true);
    fetch(`/api/rubrics?thesisId=${selectedThesisId}`)
      .then((res) => res.json())
      .then((data) => {
        const rubrics = data.rubrics || [];
        setRubric(rubrics.length > 0 ? rubrics[0] : null);
      })
      .catch(() => setRubric(null))
      .finally(() => setLoading(false));
  }, [selectedThesisId]);

  const computeOverallScore = () => {
    if (!rubric || rubric.criteria.length === 0) return 0;
    const totalWeight = rubric.criteria.reduce((s, c) => s + c.weight, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = rubric.criteria.reduce(
      (s, c) => s + (c.currentScore / c.maxScore) * c.weight,
      0
    );
    return Math.round((weightedSum / totalWeight) * 100);
  };

  const overallScore = rubric ? computeOverallScore() : 0;

  const scoreBarColor = (current: number, max: number) => {
    const pct = (current / max) * 100;
    if (pct >= 80) return "bg-green-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const scoreTextColor = (pct: number) => {
    if (pct >= 80) return "text-green-600";
    if (pct >= 60) return "text-amber-600";
    return "text-red-600";
  };

  // Circular progress dimensions
  const circleRadius = 54;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleOffset = circleCircumference - (overallScore / 100) * circleCircumference;

  return (
    <DashboardLayout navItems={studentNavItems}>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Rubric Evaluation</h1>
          <p className="text-gray-500 mt-1">View your thesis evaluation rubric and scores.</p>
        </div>

        {/* Thesis Selector */}
        <div className="card p-5 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Thesis</label>
          <select
            className="input-field"
            value={selectedThesisId}
            onChange={(e) => setSelectedThesisId(e.target.value)}
          >
            <option value="">Choose a thesis...</option>
            {theses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">Loading rubric...</div>
        )}

        {selectedThesisId && !loading && !rubric && (
          <div className="card p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <h3 className="font-semibold text-gray-600 mb-1">No rubric available</h3>
            <p className="text-sm text-gray-400">Your advisor hasn&apos;t created a rubric for this thesis yet.</p>
          </div>
        )}

        {selectedThesisId && !loading && rubric && (
          <>
            {/* Overall Progress */}
            <div className="card p-8 mb-6">
              <div className="flex flex-col sm:flex-row items-center gap-8">
                <div className="relative flex-shrink-0">
                  <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 128 128">
                    <circle
                      cx="64"
                      cy="64"
                      r={circleRadius}
                      stroke="#e5e7eb"
                      strokeWidth="10"
                      fill="none"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={circleRadius}
                      stroke={overallScore >= 80 ? "#16a34a" : overallScore >= 60 ? "#d97706" : "#dc2626"}
                      strokeWidth="10"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={circleOffset}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${scoreTextColor(overallScore)}`}>
                        {overallScore}%
                      </div>
                      <div className="text-xs text-gray-400">Overall</div>
                    </div>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-1">{rubric.title}</h2>
                  <p className="text-sm text-gray-500">
                    {rubric.criteria.length} criteria evaluated
                  </p>
                </div>
              </div>
            </div>

            {/* Criteria Cards */}
            <div className="space-y-4">
              {rubric.criteria.map((criterion, ci) => {
                const pct = criterion.maxScore > 0 ? (criterion.currentScore / criterion.maxScore) * 100 : 0;
                return (
                  <div key={ci} className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{criterion.name}</h3>
                        <span className="badge-info text-xs">{criterion.weight}%</span>
                      </div>
                      <span className={`text-lg font-bold ${scoreTextColor(pct)}`}>
                        {criterion.currentScore}/{criterion.maxScore}
                      </span>
                    </div>

                    <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
                      <div
                        className={`${scoreBarColor(criterion.currentScore, criterion.maxScore)} h-2.5 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {criterion.aiEvaluation && (
                      <div className="bg-gray-50 rounded-md p-3 mb-2">
                        <p className="text-sm text-gray-600">{criterion.aiEvaluation}</p>
                      </div>
                    )}

                    {criterion.description && (
                      <p className="text-xs text-gray-400 mt-1">{criterion.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!selectedThesisId && !loading && (
          <div className="card p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <h3 className="font-semibold text-gray-600 mb-1">Select a thesis</h3>
            <p className="text-sm text-gray-400">Choose a thesis above to view its evaluation rubric.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
