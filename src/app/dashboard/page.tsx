"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookMarked, Bot, ClipboardList, FilePlus2, Plug, Smartphone, Sparkles } from "lucide-react";
import DashboardLayout, { useTimeAgo } from "@/components/DashboardLayout";
import { DeadlineChip, DeadlineDialog, KindChip, ScoreRing } from "@/components/ui";
import DeadlineCalendar from "@/components/DeadlineCalendar";
import { useUser } from "@/components/useUser";
import { byLastWorked, currentPaper, lastWorked, progressPct, type PaperListItem, type PapersResponse } from "@/components/papers/paperList";
import { api, statusColors } from "@/lib/client";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import { paperKind } from "@/lib/papers/kinds";
import { teacherRoleKey } from "@/lib/papers/templates";
import type { StudentAssignmentView } from "@/lib/papers/views";

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

// No row gap on the parent (it would open inside each card): cards keep their distance with a bottom margin.
const STAT = "card mb-3 grid gap-0 p-4 sm:mb-4 sm:p-5 [grid-row:span_3] [grid-template-rows:subgrid]";
const STAT_LABEL = "text-xs sm:text-sm text-gray-500 mb-1";
const QUICK = "flex items-center gap-3 rounded-xl p-3 text-sm text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

export default function StudentDashboard() {
  const { user, policy, consent } = useUser();
  const t = useT();
  const format = useFormat();
  const { tag } = useLocale();
  const timeAgo = useTimeAgo();
  const words = (n: number) => (n === 1 ? t("common.word_one") : t("common.words", { n: format.number(n) }));
  const notices = (n: number) => (n === 1 ? t("dashboard.notices_one") : t("dashboard.notices", { n }));
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignmentView[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deadlineFor, setDeadlineFor] = useState<PaperListItem | null>(null);

  // The teacher sets the due date of an assigned paper: the server ignores the student's change, so no dialog for it.
  const saveDeadline = async (iso: string | undefined) => {
    if (!deadlineFor || deadlineFor.assignmentId) return;
    await api(`/api/theses/${deadlineFor.id}`, { method: "PUT", json: { deadline: iso || "" } });
    setPapers((list) => list.map((x) => (x.id === deadlineFor.id ? { ...x, deadline: iso } : x)));
  };

  useEffect(() => {
    Promise.all([api<PapersResponse>("/api/theses"), api<{ stats: Stats }>("/api/stats")])
      .then(([th, s]) => {
        setPapers(th.theses);
        setAssignments(th.assignments || []);
        setStats(s.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = currentPaper(papers);
  const recent = [...papers].sort(byLastWorked).slice(0, 4);
  const mixedKinds = new Set(papers.map((p) => paperKind(p))).size > 1;
  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;
  const editActiveDeadline = active && !active.assignmentId ? () => setDeadlineFor(active) : undefined;
  const teacherOf = (p: PaperListItem) => (p.professorId ? t("papers.work.teacherLine", { role: t(teacherRoleKey(p)), name: p.professorName }) : t("papers.teacher.none"));
  const firstAssignment = assignments[0];

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="lg:flex lg:items-start lg:gap-6">
        <div className="flex-1 min-w-0">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">{user ? t(Date.now() - Date.parse((user as { createdAt?: string }).createdAt || "") < 86400000 ? "dashboard.home.welcomeNew" : "dashboard.home.welcomeName", { name: user.name.split(" ")[0] }) : t("dashboard.home.welcome")}</h1>
          <p className="text-gray-500 mt-1">{t("dashboard.home.subtitle")}</p>
        </div>
        {!loading && active && <div className="lg:hidden mb-6"><DeadlineCalendar deadline={active.deadline} wordCount={active.wordCount || 0} targetWords={active.targetWords || 0} createdAt={active.createdAt} onEdit={editActiveDeadline} /></div>}

        {policy?.requireConsent && !consent && (
          <Link href="/dashboard/settings" className="block mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <strong>{t("dashboard.home.consentTitle")}</strong> {t("dashboard.home.consentBody", { university: policy.university })}
          </Link>
        )}

        {firstAssignment && (
          <Link
            href={assignments.length === 1 ? `/dashboard/papers?assignment=${encodeURIComponent(firstAssignment.id)}` : "/dashboard/papers"}
            className="group mb-6 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 hover:border-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-brand-700" aria-hidden="true">
              <ClipboardList className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">{t("dashboard.home.assigned", { n: assignments.length })}</span>
              <span className="block truncate text-xs text-gray-600">{assignments.length === 1 ? t("dashboard.home.assignedOne", { title: firstAssignment.title, name: firstAssignment.createdByName }) : t("dashboard.home.assignedMany")}</span>
            </span>
            <span className="hidden items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-700 sm:inline-flex">
              {assignments.length === 1 ? t("dashboard.home.assignedReadBrief") : t("dashboard.home.assignedSeeAll")}
              <ArrowRight className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" strokeWidth={2} aria-hidden="true" />
            </span>
          </Link>
        )}

        {/* Each card spans three rows of a subgrid (label, figure, note), so the figures line up across a row even
            when a translated label wraps to two lines. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 sm:gap-x-4 mb-3 sm:mb-2">
          <div className={STAT}><div className={STAT_LABEL}>{t("dashboard.home.totalWords")}</div><div className="text-xl sm:text-2xl font-bold">{format.number(stats?.totalWords || 0)}</div></div>
          <div className={STAT}><div className={STAT_LABEL}>{t("dashboard.home.integrityScore")}</div><div className="text-xl sm:text-2xl font-bold text-green-700">{stats?.avgIntegrity ?? "–"}%</div></div>
          <div className={STAT}>
            <div className={STAT_LABEL}>{t("glossary.aiAssisted")}</div>
            <div className="text-xl sm:text-2xl font-bold text-prov-ai">
              {stats?.avgAiUsage ?? 0}%
              {/* The institution's limit applies per paper: an average across kinds is shown without comparing it to the limit. */}
              {!mixedKinds && <span className="text-xs text-gray-500 font-normal ml-1">/ {policy?.maxAiUsagePercent ?? 25}%</span>}
            </div>
            {mixedKinds && <div className="mt-0.5 text-xs text-gray-500">{t("dashboard.home.aiAverage")}</div>}
          </div>
          <div className={STAT}><div className={STAT_LABEL}>{t("dashboard.home.aiInteractions")}</div><div className="text-xl sm:text-2xl font-bold">{stats?.aiInteractions ?? 0}</div></div>
        </div>

        {active && (
          <div className="card p-5 sm:p-6 mb-6 shadow-glow-brand hover:shadow-glow-brand-strong">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-brand-700">{t("dashboard.home.working")}</span>
                  <KindChip kind={paperKind(active)} />
                </div>
                <h3 className="text-base font-semibold truncate" title={active.title}>{active.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {active.assignmentId ? t("papers.work.assignmentFrom", { name: active.assignment?.createdByName || active.professorName }) : teacherOf(active)}
                  <span aria-hidden="true"> · </span>
                  {words(active.wordCount)}
                  <span aria-hidden="true"> · </span>
                  {t("dashboard.home.lastWorked", { time: timeAgo(lastWorked(active)) })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <ScoreRing value={active.integrityScore} />
                <Link href={`/dashboard/editor/${active.id}`} className="btn-primary whitespace-nowrap">{t("dashboard.home.continue")}</Link>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{t("dashboard.home.progress")}</span><span className="tabular-nums">{t("dashboard.progressWords", { n: format.number(active.wordCount), target: format.number(active.targetWords) })}</span></div>
              <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-brand-600 h-2 rounded-full transition-all" style={{ width: `${progressPct(active.wordCount, active.targetWords)}%` }} /></div>
            </div>
          </div>
        )}
        </div>
        {!loading && active && <div className="hidden lg:block lg:sticky lg:top-4 mb-6"><DeadlineCalendar deadline={active.deadline} wordCount={active.wordCount || 0} targetWords={active.targetWords || 0} createdAt={active.createdAt} onEdit={editActiveDeadline} /></div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold mb-4">{t("dashboard.home.thisWeek")}</h2>
            <div className="flex items-end gap-2 h-32">
              {(stats?.weekly || []).map((d) => {
                const max = Math.max(1, ...(stats?.weekly || []).map((x) => x.words));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-24"><div className="w-full bg-brand-600 rounded-t-md" style={{ height: `${(d.words / max) * 100}%` }} title={words(d.words)} /></div>
                    <span className="text-[11px] text-gray-500">{d.date ? new Date(d.date + "T12:00:00").toLocaleDateString(tag, { weekday: "short" }) : d.day}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1">{t("dashboard.home.whoWrote")}</div>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-prov-human" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} />
                <div className="bg-prov-paste" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} />
                <div className="bg-prov-ai" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 mt-1.5">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-prov-human" aria-hidden="true" />{t("glossary.written")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-prov-paste" aria-hidden="true" />{t("glossary.quotedOrPasted")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-prov-ai" aria-hidden="true" />{t("glossary.aiAssisted")}</span>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold mb-3">{t("dashboard.home.quickActions")}</h2>
            <div className="space-y-1">
              <Link href="/dashboard/papers?new=1" className={QUICK}><FilePlus2 className="w-5 h-5 text-brand-600" aria-hidden="true" />{t("dashboard.home.newThesis")}</Link>
              <Link href="/dashboard/sources" className={QUICK}><BookMarked className="w-5 h-5 text-brand-600" aria-hidden="true" />{t("glossary.sourcesReferences")}</Link>
              <Link href="/dashboard/ai-chat?mode=copilot" className={QUICK}><Sparkles className="w-5 h-5 text-accent-700" aria-hidden="true" />{t("glossary.copilot")}</Link>
              <Link href="/dashboard/ai-chat" className={QUICK}><Bot className="w-5 h-5 text-brand-600" aria-hidden="true" />{t("dashboard.home.askAssistant")}</Link>
              <Link href="/dashboard/connections" className={QUICK}><Plug className="w-5 h-5 text-brand-600" aria-hidden="true" />{stats?.connectedProviders?.length ? t("dashboard.home.connected", { list: stats.connectedProviders.join(", ") }) : t("dashboard.home.connect")}</Link>
              <Link href="/dashboard/settings#mobile" className={QUICK}><Smartphone className="w-5 h-5 text-brand-600" aria-hidden="true" />{t("dashboard.home.installPhone")}</Link>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold">{t("dashboard.home.yourTheses")}</h2><Link href="/dashboard/papers" className="text-sm text-brand-700 font-medium hover:underline">{t("dashboard.home.viewAll")}</Link></div>
          {loading ? <div className="p-8 text-center text-gray-500 text-sm">{t("common.loading")}…</div> : papers.length === 0 ? <div className="p-8 text-center text-gray-500 text-sm">{t("dashboard.home.noTheses")} <Link href="/dashboard/papers?new=1" className="text-brand-700 font-medium hover:underline">{t("dashboard.home.startFirst")}</Link></div> : (
            <div className="divide-y divide-gray-100">
              {recent.map((p) => (
                <Link key={p.id} href={`/dashboard/editor/${p.id}`} className="flex items-center justify-between gap-4 p-4 sm:px-5 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{p.title}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap"><KindChip kind={paperKind(p)} /><span className={statusColors[p.status]}>{t(`dashboard.status.${p.status}`)}</span><span className="text-xs text-gray-500 tabular-nums">{words(p.wordCount)}</span><DeadlineChip deadline={p.deadline} wordCount={p.wordCount} targetWords={p.targetWords} status={p.status} submittedAt={p.submittedAt} late={p.late} />{p.openFlags > 0 && <span className="badge-warning">{notices(p.openFlags)}</span>}</div>
                  </div>
                  <div className="text-right hidden sm:block flex-shrink-0"><div className="text-sm font-semibold text-green-700 tabular-nums">{p.integrityScore}%</div><div className="text-xs text-gray-500">{t("glossary.integrity")}</div></div>
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
