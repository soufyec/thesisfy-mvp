"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, FileText, Plug, Smartphone, Sparkles } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ScoreRing } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api, statusColors, statusLabels, timeAgo } from "@/lib/client";

interface Thesis {
  id: string;
  title: string;
  status: string;
  wordCount: number;
  targetWords: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  updatedAt: string;
  professorName: string;
  openFlags: number;
}

interface Stats {
  totalWords: number;
  avgIntegrity: number;
  avgAiUsage: number;
  totalSessions: number;
  aiInteractions: number;
  provenance: { human: number; paste: number; ai: number };
  weekly: { day: string; words: number; ai: number }[];
  connectedProviders?: string[];
}

export default function StudentDashboard() {
  const { user, policy, consent } = useUser();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<{ theses: Thesis[] }>("/api/theses"), api<{ stats: Stats }>("/api/stats")])
      .then(([t, s]) => {
        setTheses(t.theses);
        setStats(s.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = theses.find((t) => t.status === "in_progress") || theses[0];
  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}!</h1>
          <p className="text-gray-500 mt-1">Here&apos;s where your writing stands.</p>
        </div>

        {policy?.requireConsent && !consent && (
          <Link href="/dashboard/settings" className="block mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <strong>Set your monitoring choices</strong> before your next writing session: {policy.university} requires transparent AI logging. Review what is (and isn&apos;t) recorded →
          </Link>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">Total words</div><div className="text-xl sm:text-2xl font-bold">{(stats?.totalWords || 0).toLocaleString()}</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">Integrity score</div><div className="text-xl sm:text-2xl font-bold text-green-600">{stats?.avgIntegrity ?? "–"}%</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">AI-assisted</div><div className="text-xl sm:text-2xl font-bold text-purple-600">{stats?.avgAiUsage ?? 0}%<span className="text-xs text-gray-400 font-normal ml-1">/ {policy?.maxAiUsagePercent ?? 25}%</span></div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">AI interactions</div><div className="text-xl sm:text-2xl font-bold">{stats?.aiInteractions ?? 0}</div></div>
        </div>

        {active && (
          <div className="card p-5 sm:p-6 mb-6 border-l-4 border-l-brand-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-brand-600 mb-1">Currently working on</div>
                <h3 className="text-lg font-semibold truncate">{active.title}</h3>
                <p className="text-sm text-gray-500 mt-1">Advisor: {active.professorName} · {active.wordCount.toLocaleString()} words · updated {timeAgo(active.updatedAt)}</p>
              </div>
              <div className="flex items-center gap-4">
                <ScoreRing value={active.integrityScore} />
                <Link href={`/dashboard/editor/${active.id}`} className="btn-primary whitespace-nowrap">Continue writing</Link>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Progress</span><span>{active.wordCount.toLocaleString()} / {active.targetWords.toLocaleString()} words</span></div>
              <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${Math.min((active.wordCount / active.targetWords) * 100, 100)}%` }} /></div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">This week</h2>
            <div className="flex items-end gap-2 h-32">
              {(stats?.weekly || []).map((d) => {
                const max = Math.max(1, ...(stats?.weekly || []).map((x) => x.words));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-24"><div className="w-full bg-brand-500 rounded-t-md" style={{ height: `${(d.words / max) * 100}%` }} title={`${d.words} words`} /></div>
                    <span className="text-[10px] text-gray-500">{d.day}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1">Who wrote your theses</div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-green-500" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} />
                <div className="bg-purple-500" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} />
              </div>
              <div className="flex gap-3 text-[11px] text-gray-500 mt-1"><span>● You</span><span className="text-amber-500">● Pasted</span><span className="text-purple-600">● AI-assisted</span></div>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold mb-3">Quick actions</h2>
            <div className="space-y-2">
              <Link href="/dashboard/theses?new=1" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><FileText className="w-5 h-5 text-brand-600" />New thesis</Link>
              <Link href="/dashboard/ai-chat" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Bot className="w-5 h-5 text-brand-600" />Ask the AI assistant</Link>
              <Link href="/dashboard/connections" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Plug className="w-5 h-5 text-brand-600" />{stats?.connectedProviders?.length ? `Connected: ${stats.connectedProviders.join(", ")}` : "Connect Claude / ChatGPT / Gemini"}</Link>
              <Link href="/dashboard/settings#mobile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Smartphone className="w-5 h-5 text-brand-600" />Install on your phone</Link>
              <Link href="/dashboard/settings#extension" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Sparkles className="w-5 h-5 text-brand-600" />Transparent AI use extension</Link>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold">Your theses</h2><Link href="/dashboard/theses" className="text-sm text-brand-600 font-medium">View all</Link></div>
          {loading ? <div className="p-8 text-center text-gray-400">Loading…</div> : theses.length === 0 ? <div className="p-8 text-center text-gray-400">No theses yet. <Link href="/dashboard/theses?new=1" className="text-brand-600">Start your first one</Link>.</div> : (
            <div className="divide-y divide-gray-50">
              {theses.map((t) => (
                <Link key={t.id} href={`/dashboard/editor/${t.id}`} className="flex items-center justify-between p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{t.title}</h3>
                    <div className="flex items-center gap-3 mt-1 flex-wrap"><span className={statusColors[t.status]}>{statusLabels[t.status]}</span><span className="text-xs text-gray-400">{t.wordCount.toLocaleString()} words</span>{t.openFlags > 0 && <span className="badge-warning">{t.openFlags} notice{t.openFlags > 1 ? "s" : ""}</span>}</div>
                  </div>
                  <div className="flex items-center gap-4 ml-4"><div className="text-right hidden sm:block"><div className="text-sm font-semibold text-green-600">{t.integrityScore}%</div><div className="text-xs text-gray-400">Integrity</div></div></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
