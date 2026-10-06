"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/components/useUser";
import { api, timeAgo } from "@/lib/client";

interface Stats {
  totalWords: number;
  avgIntegrity: number;
  avgAiUsage: number;
  totalSessions: number;
  aiInteractions: number;
  aiByMode: Record<string, number>;
  aiByProvider: Record<string, number>;
  provenance: { human: number; paste: number; ai: number };
  weekly: { day: string; words: number; ai: number; minutes: number }[];
  openFlags: number;
}

interface Interaction {
  id: string;
  provider: string;
  model: string;
  mode: string;
  source: string;
  promptPreview: string;
  insertedWords: number;
  blockedByPolicy: boolean;
  timestamp: string;
  thesisTitle?: string;
}

export default function AnalyticsPage() {
  const { policy } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<Interaction[]>([]);

  useEffect(() => {
    api<{ stats: Stats }>("/api/stats").then((d) => setStats(d.stats)).catch(() => {});
    api<{ interactions: Interaction[] }>("/api/ai/logs").then((d) => setLogs(d.interactions)).catch(() => {});
  }, []);

  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;
  const maxWords = Math.max(1, ...(stats?.weekly || []).map((d) => d.words));
  const modes = Object.entries(stats?.aiByMode || {}).sort((a, b) => b[1] - a[1]);
  const modeTotal = Math.max(1, modes.reduce((a, [, n]) => a + n, 0));

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-6"><h1 className="text-2xl font-bold">Writing analytics</h1><p className="text-gray-500 mt-1 text-sm">Your writing patterns and AI usage, exactly as your advisor sees them.</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">Total words</div><div className="text-xl sm:text-2xl font-bold">{(stats?.totalWords || 0).toLocaleString()}</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">Integrity</div><div className="text-xl sm:text-2xl font-bold text-green-600">{stats?.avgIntegrity ?? 0}%</div><div className="text-xs text-gray-400 mt-1">{stats?.openFlags || 0} open notices</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">AI-assisted</div><div className="text-xl sm:text-2xl font-bold text-purple-600">{stats?.avgAiUsage ?? 0}%</div><div className="text-xs text-gray-400 mt-1">limit {policy?.maxAiUsagePercent ?? 25}%</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">Writing sessions</div><div className="text-xl sm:text-2xl font-bold">{stats?.totalSessions ?? 0}</div><div className="text-xs text-gray-400 mt-1">{stats?.aiInteractions ?? 0} AI interactions</div></div>
        </div>

        <div className="card p-5 sm:p-6 mb-6">
          <h2 className="font-semibold mb-4">Last 7 days</h2>
          <div className="flex items-end gap-2 sm:gap-3 h-44">
            {(stats?.weekly || []).map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end h-32"><div className="text-[10px] text-gray-400 mb-1">{d.words || ""}</div><div className="w-full bg-brand-500 rounded-t-md hover:bg-brand-600 transition-all" style={{ height: `${(d.words / maxWords) * 100}%` }} title={`${d.words} words, ${d.ai} AI assists, ${d.minutes} min`} /></div>
                <span className="text-[11px] text-gray-500">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-4">Who wrote your text</h2>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 mb-3">
              <div className="bg-green-500" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} />
              <div className="bg-purple-500" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} />
            </div>
            <div className="space-y-2 text-sm">
              {[["You typed", stats?.provenance.human, "bg-green-500"], ["Pasted (unattributed or quoted)", stats?.provenance.paste, "bg-amber-400"], ["AI-assisted (inserted from an AI tool)", stats?.provenance.ai, "bg-purple-500"]].map(([l, v, c]) => (
                <div key={String(l)} className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c}`} /><span className="flex-1 text-gray-600">{l}</span><span className="font-medium">{Number(v || 0).toLocaleString()} w · {Math.round((Number(v || 0) / total) * 100)}%</span></div>
              ))}
            </div>
          </div>
          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-4">How you use AI</h2>
            {modes.length === 0 && <div className="text-sm text-gray-400">No AI interactions yet.</div>}
            <div className="space-y-3">
              {modes.map(([m, n]) => (
                <div key={m}><div className="flex justify-between text-sm mb-1"><span className="text-gray-600 capitalize">{m.replace("_", " ")}</span><span className="font-medium">{n}</span></div><div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-brand-500 h-2 rounded-full" style={{ width: `${(n / modeTotal) * 100}%` }} /></div></div>
              ))}
            </div>
            {stats && Object.keys(stats.aiByProvider).length > 0 && <div className="mt-4 text-xs text-gray-500">Providers: {Object.entries(stats.aiByProvider).map(([p, n]) => `${p} (${n})`).join(" · ")}</div>}
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">AI interaction log</h2><p className="text-xs text-gray-400 mt-0.5">Every assistant and Research copilot request. This is what your advisor sees.</p></div>
          <div className="divide-y divide-gray-50">
            {logs.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No interactions logged yet.</div>}
            {logs.slice(0, 40).map((i) => (
              <div key={i.id} className="p-4 flex items-start gap-3 text-sm">
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${i.blockedByPolicy ? "bg-red-500" : i.mode === "copilot" ? "bg-emerald-500" : "bg-brand-500"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-medium capitalize">{i.mode.replace("_", " ")}</span><span className="text-xs text-gray-400">{i.provider} · {i.model}</span>{i.mode === "copilot" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px]">copilot</span>}{i.blockedByPolicy && <span className="badge-danger !text-[10px]">blocked</span>}{i.insertedWords > 0 && <span className="badge-info !text-[10px]">{i.insertedWords} words inserted</span>}</div>
                  <div className="text-gray-600 truncate">{i.promptPreview}</div>
                  <div className="text-[11px] text-gray-400">{i.thesisTitle ? `${i.thesisTitle} · ` : ""}{timeAgo(i.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
