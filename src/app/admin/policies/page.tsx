"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Toggle } from "@/components/ui";
import { useUser, type Policy } from "@/components/useUser";
import { api } from "@/lib/client";

const PROVIDERS = [["anthropic", "Claude (Anthropic)"], ["openai", "ChatGPT / GPT (OpenAI)"], ["google", "Gemini (Google)"], ["mistral", "Mistral / Le Chat"]];
const MODES = [["chat", "Ask"], ["brainstorm", "Brainstorm"], ["outline", "Outline"], ["critique", "Critique"], ["grammar", "Grammar & style"], ["summarize", "Summarize"], ["explain", "Explain"], ["citations", "Citations"], ["gaps", "Find gaps"], ["paraphrase_check", "Paraphrase check"]];
const MONITORING: [keyof Policy["monitoring"], string, string][] = [["keystrokes", "Typing rhythm", "Counts and speed only"], ["paste", "Paste detection", "Sizes and fingerprints for attribution"], ["aiInteractions", "AI interaction logging", "Prompts and answers via the assistant"], ["tabActivity", "Tab activity", "Editor tab hidden/visible"]];

export default function PoliciesPage() {
  const { user } = useUser();
  const [p, setP] = useState<Policy | null>(null);
  const [saved, setSaved] = useState("");
  const canEdit = user?.role === "admin";

  useEffect(() => {
    api<{ policy: Policy }>("/api/policies").then((d) => setP(d.policy)).catch(() => {});
  }, []);

  const save = async () => {
    if (!p) return;
    try {
      const d = await api<{ policy: Policy }>("/api/policies", { method: "PUT", json: p });
      setP(d.policy);
      setSaved("Policies saved. They apply to new sessions immediately.");
    } catch (e) {
      setSaved((e as Error).message);
    }
    setTimeout(() => setSaved(""), 3000);
  };

  if (!p) return <DashboardLayout><div className="text-gray-400 text-sm">Loading…</div></DashboardLayout>;
  const toggleIn = (key: "allowedProviders" | "allowedModes", v: string) => setP({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] });

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-3xl">
        <div className="mb-6"><h1 className="text-2xl font-bold">AI policies</h1><p className="text-gray-500 mt-1 text-sm">{p.university} · last updated {new Date(p.updatedAt).toLocaleString()}{!canEdit && " · read-only for advisors"}</p></div>
        {saved && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{saved}</div>}
        <div className="space-y-5">
          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">Maximum AI-assisted content</h2>
            <p className="text-sm text-gray-500 mb-4">Share of a thesis that may come from AI tools (inserted assistant output or attributed pastes). Above this, a high-severity flag is raised.</p>
            <div className="flex items-center gap-4"><input type="range" min={0} max={50} disabled={!canEdit} value={p.maxAiUsagePercent} onChange={(e) => setP({ ...p, maxAiUsagePercent: Number(e.target.value) })} className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600" /><span className="text-2xl font-bold text-brand-600 w-16 text-right">{p.maxAiUsagePercent}%</span></div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">Providers &amp; student accounts</h2>
            <p className="text-sm text-gray-500 mb-4">Which AI providers students may use, and whether they may connect their own subscriptions (BYOK).</p>
            <div className="space-y-2">
              {PROVIDERS.map(([id, label]) => (
                <div key={id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><span className="text-sm">{label}</span><Toggle checked={p.allowedProviders.includes(id)} disabled={!canEdit} onChange={() => toggleIn("allowedProviders", id)} /></div>
              ))}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">Allow personal AI accounts</div><div className="text-xs text-gray-500">Students connect Claude / ChatGPT / Gemini keys; requests are still logged and limited.</div></div><Toggle checked={p.allowBYOK} disabled={!canEdit} onChange={(v) => setP({ ...p, allowBYOK: v })} /></div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">Block “write it for me” requests</div><div className="text-xs text-gray-500">Requests for generated thesis text are refused and logged as blocked.</div></div><Toggle checked={p.blockGeneration} disabled={!canEdit} onChange={(v) => setP({ ...p, blockGeneration: v })} /></div>
            </div>
          </div>

          <div className="card p-5 sm:p-6 border-emerald-100">
            <h2 className="font-semibold mb-1">Research copilot</h2>
            <p className="text-sm text-gray-500 mb-4">Full freedom to ask about anything connected to their research, on the models the university provides (<a href="/admin/ai-access" className="text-brand-600 underline">AI access &amp; billing</a>). The history is kept and visible to the institution. Writing thesis text stays blocked, and sentences taken from an answer into the thesis are recognised and marked as AI-assisted.</p>
            <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl"><div><div className="text-sm font-medium">Offer the research copilot to students</div><div className="text-xs text-gray-500">Adds a “Research copilot” mode to the assistant, independent of the mode list above.</div></div><Toggle checked={!!p.researchCopilot} disabled={!canEdit} onChange={(v) => setP({ ...p, researchCopilot: v })} /></div>
            <ul className="mt-3 text-xs text-gray-500 space-y-1 list-disc pl-5">
              <li>Any question: literature, methods, statistics, code, planning, reading strategies.</li>
              <li>Never produces thesis text: “write my introduction” is refused and logged as blocked.</li>
              <li>Every answer is fingerprinted sentence by sentence; pasting it into the thesis marks it as AI-assisted automatically.</li>
            </ul>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">Permitted assistant modes</h2>
            <p className="text-sm text-gray-500 mb-4">Modes not selected are hidden from students.</p>
            <div className="flex flex-wrap gap-2">
              {MODES.map(([id, label]) => <button key={id} disabled={!canEdit} onClick={() => toggleIn("allowedModes", id)} className={`px-3 py-1.5 rounded-full text-xs border ${p.allowedModes.includes(id) ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 text-gray-600"}`}>{label}</button>)}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">Flag sensitivity</h2>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {([["low", "Low", "Only severe violations"], ["medium", "Medium", "Moderate and severe"], ["high", "High", "All anomalies"]] as const).map(([v, l, d]) => <button key={v} disabled={!canEdit} onClick={() => setP({ ...p, flagSensitivity: v })} className={`p-3 rounded-xl border-2 text-left ${p.flagSensitivity === v ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}><div className="text-sm font-medium">{l}</div><div className="text-xs text-gray-500 mt-0.5">{d}</div></button>)}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">Monitoring features</h2>
            <p className="text-sm text-gray-500 mb-4">What Thesisfic may collect. Students still choose individually within these limits; disabled features never appear in their consent screen.</p>
            <div className="space-y-2">
              {MONITORING.map(([k, l, d]) => <div key={k} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm">{l}</div><div className="text-xs text-gray-500">{d}</div></div><Toggle checked={p.monitoring[k]} disabled={!canEdit} onChange={(v) => setP({ ...p, monitoring: { ...p.monitoring, [k]: v } })} /></div>)}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">Require consent before monitoring</div><div className="text-xs text-gray-500">Students must accept AI logging to use the assistant and monitored editor.</div></div><Toggle checked={p.requireConsent} disabled={!canEdit} onChange={(v) => setP({ ...p, requireConsent: v })} /></div>
            </div>
          </div>

          {canEdit && <button onClick={save} className="btn-primary w-full">Save policies</button>}
        </div>
      </div>
    </DashboardLayout>
  );
}
