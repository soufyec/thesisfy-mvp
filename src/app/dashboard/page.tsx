"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, FileText, Plug, Smartphone, Sparkles } from "lucide-react";
import DashboardLayout, { useTimeAgo } from "@/components/DashboardLayout";
import { DeadlineChip, DeadlineDialog, DEADLINE_TEXT, ScoreRing, useDeadlineLabel } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api, statusColors } from "@/lib/client";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import { deadlineState } from "@/lib/deadline";

interface Thesis {
  id: string;
  title: string;
  status: string;
  wordCount: number;
  targetWords: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  createdAt?: string;
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
  weekly: { day: string; date?: string; words: number; ai: number }[];
  connectedProviders?: string[];
}

export default function StudentDashboard() {
  const { user, policy, consent } = useUser();
  const t = useT();
  const format = useFormat();
  const { tag } = useLocale();
  const timeAgo = useTimeAgo();
  const words = (n: number) => (n === 1 ? t("common.word_one") : t("common.words", { n: format.number(n) }));
  const notices = (n: number) => (n === 1 ? t("dashboard.notices_one") : t("dashboard.notices", { n }));
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deadlineFor, setDeadlineFor] = useState<Thesis | null>(null);
  const deadlineLabel = useDeadlineLabel();

  const saveDeadline = async (iso: string | undefined) => {
    if (!deadlineFor) return;
    await api(`/api/theses/${deadlineFor.id}`, { method: "PUT", json: { deadline: iso || "" } });
    setTheses((list) => list.map((x) => (x.id === deadlineFor.id ? { ...x, deadline: iso } : x)));
  };

  useEffect(() => {
    Promise.all([api<{ theses: Thesis[] }>("/api/theses"), api<{ stats: Stats }>("/api/stats")])
      .then(([th, s]) => {
        setTheses(th.theses);
        setStats(s.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = theses.find((x) => x.status === "in_progress") || theses[0];
  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{user ? t(Date.now() - Date.parse((user as { createdAt?: string }).createdAt || "") < 86400000 ? "dashboard.home.welcomeNew" : "dashboard.home.welcomeName", { name: user.name.split(" ")[0] }) : t("dashboard.home.welcome")}</h1>
          <p className="text-gray-500 mt-1">{t("dashboard.home.subtitle")}</p>
        </div>

        {policy?.requireConsent && !consent && (
          <Link href="/dashboard/settings" className="block mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <strong>{t("dashboard.home.consentTitle")}</strong> {t("dashboard.home.consentBody", { university: policy.university })}
          </Link>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">{t("dashboard.home.totalWords")}</div><div className="text-xl sm:text-2xl font-bold">{format.number(stats?.totalWords || 0)}</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">{t("dashboard.home.integrityScore")}</div><div className="text-xl sm:text-2xl font-bold text-green-600">{stats?.avgIntegrity ?? "–"}%</div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">{t("glossary.aiAssisted")}</div><div className="text-xl sm:text-2xl font-bold text-purple-600">{stats?.avgAiUsage ?? 0}%<span className="text-xs text-gray-400 font-normal ml-1">/ {policy?.maxAiUsagePercent ?? 25}%</span></div></div>
          <div className="card p-4 sm:p-5"><div className="text-xs sm:text-sm text-gray-500 mb-1">{t("dashboard.home.aiInteractions")}</div><div className="text-xl sm:text-2xl font-bold">{stats?.aiInteractions ?? 0}</div></div>
        </div>

        {active && (
          <div className="card p-5 sm:p-6 mb-6 border-l-4 border-l-brand-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-brand-600 mb-1">{t("dashboard.home.working")}</div>
                <h3 className="text-lg font-semibold truncate">{active.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{t("dashboard.home.activeMeta", { advisor: active.professorName, words: words(active.wordCount), time: timeAgo(active.updatedAt) })}</p>
              </div>
              <div className="flex items-center gap-4">
                <ScoreRing value={active.integrityScore} />
                <Link href={`/dashboard/editor/${active.id}`} className="btn-primary whitespace-nowrap">{t("dashboard.home.continue")}</Link>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{t("dashboard.home.progress")}</span><span>{t("dashboard.progressWords", { n: format.number(active.wordCount), target: format.number(active.targetWords) })}</span></div>
              <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${Math.min((active.wordCount / active.targetWords) * 100, 100)}%` }} /></div>
            </div>
            {(() => {
              const d = deadlineState(active.deadline, active.wordCount, active.targetWords, active.createdAt);
              if (!d) {
                return (
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500 flex-wrap">
                    <span>{t("deadline.timeLeft")} · {t("deadline.none")}</span>
                    <DeadlineChip deadline={undefined} wordCount={active.wordCount} targetWords={active.targetWords} onClick={() => setDeadlineFor(active)} />
                  </div>
                );
              }
              const bar = { ok: "bg-accent-500", soon: "bg-amber-500", urgent: "bg-red-500", overdue: "bg-red-600" }[d.tone];
              return (
                <div className="mt-4" data-testid="deadline-block">
                  <div className="flex justify-between items-end text-xs text-gray-500 mb-1 gap-3 flex-wrap">
                    <span>{t("deadline.timeLeft")}</span>
                    <span className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${DEADLINE_TEXT[d.tone]}`}>{deadlineLabel(d)}</span>
                      <span>· {t("deadline.due", { date: format.date(active.deadline as string) })}</span>
                      <button type="button" onClick={() => setDeadlineFor(active)} className="text-brand-600 font-medium hover:underline">{t("deadline.change")}</button>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2" aria-hidden="true"><div className={`${bar} h-2 rounded-full transition-all`} style={{ width: `${Math.round(d.elapsed * 100)}%` }} /></div>
                  <p className="text-xs text-gray-500 mt-2">
                    {d.wordsLeft === 0 ? t("deadline.paceDone") : d.daysLeft > 0 ? t("deadline.pace", { n: format.number(d.perDay), week: format.number(d.perWeek) }) : t("deadline.paceNoDays", { n: format.number(d.wordsLeft) })}
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">{t("dashboard.home.thisWeek")}</h2>
            <div className="flex items-end gap-2 h-32">
              {(stats?.weekly || []).map((d) => {
                const max = Math.max(1, ...(stats?.weekly || []).map((x) => x.words));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-24"><div className="w-full bg-brand-500 rounded-t-md" style={{ height: `${(d.words / max) * 100}%` }} title={words(d.words)} /></div>
                    <span className="text-[10px] text-gray-500">{d.date ? new Date(d.date + "T12:00:00").toLocaleDateString(tag, { weekday: "short" }) : d.day}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1">{t("dashboard.home.whoWrote")}</div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-green-500" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} />
                <div className="bg-purple-500" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} />
              </div>
              <div className="flex gap-3 text-[11px] text-gray-500 mt-1"><span>● {t("dashboard.home.you")}</span><span className="text-amber-500">● {t("dashboard.home.pasted")}</span><span className="text-purple-600">● {t("glossary.aiAssisted")}</span></div>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold mb-3">{t("dashboard.home.quickActions")}</h2>
            <div className="space-y-2">
              <Link href="/dashboard/theses?new=1" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><FileText className="w-5 h-5 text-brand-600" />{t("dashboard.home.newThesis")}</Link>
              <Link href="/dashboard/ai-chat?mode=copilot" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Sparkles className="w-5 h-5 text-emerald-600" />{t("glossary.copilot")}</Link>
              <Link href="/dashboard/ai-chat" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Bot className="w-5 h-5 text-brand-600" />{t("dashboard.home.askAssistant")}</Link>
              <Link href="/dashboard/connections" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Plug className="w-5 h-5 text-brand-600" />{stats?.connectedProviders?.length ? t("dashboard.home.connected", { list: stats.connectedProviders.join(", ") }) : t("dashboard.home.connect")}</Link>
              <Link href="/dashboard/settings#mobile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-sm"><Smartphone className="w-5 h-5 text-brand-600" />{t("dashboard.home.installPhone")}</Link>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold">{t("dashboard.home.yourTheses")}</h2><Link href="/dashboard/theses" className="text-sm text-brand-600 font-medium">{t("dashboard.home.viewAll")}</Link></div>
          {loading ? <div className="p-8 text-center text-gray-400">{t("common.loading")}…</div> : theses.length === 0 ? <div className="p-8 text-center text-gray-400">{t("dashboard.home.noTheses")} <Link href="/dashboard/theses?new=1" className="text-brand-600">{t("dashboard.home.startFirst")}</Link></div> : (
            <div className="divide-y divide-gray-50">
              {theses.map((th) => (
                <Link key={th.id} href={`/dashboard/editor/${th.id}`} className="flex items-center justify-between p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{th.title}</h3>
                    <div className="flex items-center gap-3 mt-1 flex-wrap"><span className={statusColors[th.status]}>{t(`dashboard.status.${th.status}`)}</span><span className="text-xs text-gray-400">{words(th.wordCount)}</span><DeadlineChip deadline={th.deadline} wordCount={th.wordCount} targetWords={th.targetWords} />{th.openFlags > 0 && <span className="badge-warning">{notices(th.openFlags)}</span>}</div>
                  </div>
                  <div className="flex items-center gap-4 ml-4"><div className="text-right hidden sm:block"><div className="text-sm font-semibold text-green-600">{th.integrityScore}%</div><div className="text-xs text-gray-400">{t("glossary.integrity")}</div></div></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <DeadlineDialog open={!!deadlineFor} onClose={() => setDeadlineFor(null)} deadline={deadlineFor?.deadline} onSave={saveDeadline} />
    </DashboardLayout>
  );
}
