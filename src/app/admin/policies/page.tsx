"use client";

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { adminNavItems } from "@/lib/nav-items";


export default function PoliciesPage() {
  const [maxAiUsage, setMaxAiUsage] = useState(25);
  const [flagThreshold, setFlagThreshold] = useState("medium");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <DashboardLayout navItems={adminNavItems}>
      <div className="animate-fade-in max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">AI Policies</h1>
          <p className="text-gray-500 mt-1">Configure AI usage rules for your institution.</p>
        </div>

        {saved && (
          <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            Policies saved successfully!
          </div>
        )}

        <div className="space-y-6">
          {/* Max AI Usage */}
          <div className="card p-6">
            <h2 className="font-semibold mb-1">Maximum AI Usage Percentage</h2>
            <p className="text-sm text-gray-500 mb-4">Set the maximum allowed AI-assisted content per thesis.</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="50"
                value={maxAiUsage}
                onChange={(e) => setMaxAiUsage(Number(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <span className="text-2xl font-bold text-brand-600 w-16 text-right">{maxAiUsage}%</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>No AI allowed</span>
              <span>50% max</span>
            </div>
          </div>

          {/* Permitted AI Tools */}
          <div className="card p-6">
            <h2 className="font-semibold mb-1">Permitted AI Tools</h2>
            <p className="text-sm text-gray-500 mb-4">Choose which AI tools students can use.</p>
            <div className="space-y-3">
              {[
                { name: "Thesisfy AI Assistant (Claude)", description: "Built-in regulated AI with academic guardrails", enabled: true },
                { name: "Grammar & Style Checker", description: "AI-powered grammar and style suggestions", enabled: true },
                { name: "Citation Assistant", description: "Help formatting and finding references", enabled: true },
                { name: "External AI Tools (ChatGPT, etc.)", description: "Allow use of external AI tools (logged)", enabled: false },
              ].map((tool) => (
                <div key={tool.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-sm font-medium">{tool.name}</div>
                    <div className="text-xs text-gray-500">{tool.description}</div>
                  </div>
                  <div className={`w-10 h-6 rounded-full flex items-center cursor-pointer transition-colors ${tool.enabled ? "bg-brand-600 justify-end" : "bg-gray-300 justify-start"}`}>
                    <div className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Flag Sensitivity */}
          <div className="card p-6">
            <h2 className="font-semibold mb-1">Flag Sensitivity</h2>
            <p className="text-sm text-gray-500 mb-4">How aggressively should we flag potential integrity issues?</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "low", label: "Low", desc: "Only flag severe violations" },
                { value: "medium", label: "Medium", desc: "Flag moderate and severe" },
                { value: "high", label: "High", desc: "Flag all anomalies" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFlagThreshold(opt.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${flagThreshold === opt.value ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Monitoring Options */}
          <div className="card p-6">
            <h2 className="font-semibold mb-1">Monitoring Features</h2>
            <p className="text-sm text-gray-500 mb-4">Select which behaviors to track.</p>
            <div className="space-y-3">
              {[
                { name: "Keystroke Pattern Analysis", enabled: true },
                { name: "Copy/Paste Detection", enabled: true },
                { name: "Writing Speed Monitoring", enabled: true },
                { name: "Style Consistency Check", enabled: true },
                { name: "Session Duration Tracking", enabled: true },
                { name: "AI Interaction Logging", enabled: true },
              ].map((feature) => (
                <label key={feature.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <span className="text-sm">{feature.name}</span>
                  <input type="checkbox" defaultChecked={feature.enabled} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                </label>
              ))}
            </div>
          </div>

          <button onClick={handleSave} className="btn-primary w-full">
            Save Policies
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
