"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { DeadlineChip, KindChip } from "@/components/ui";
import { api, statusColors } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { plural, statusLabel, timeAgoLabel } from "@/lib/i18n/messages/admin";
import type { PaperKind } from "@/lib/papers/kinds";
import { teacherRoleKey } from "@/lib/papers/templates";
import type { PaperAssignmentInfo, PaperStatus } from "@/lib/papers/views";

interface Thesis {
  id: string;
  title: string;
  status: PaperStatus;
  wordCount: number;
  targetWords: number;
  aiUsagePercent: number;
  integrityScore: number;
  studentName: string;
  professorName: string;
  professorId?: string;
  updatedAt: string;
  deadline?: string;
  openFlags: number;
  sessionCount: number;
  kind?: PaperKind;
  assignment?: PaperAssignmentInfo;
  submittedAt?: string;
  late?: boolean;
}

const scoreTone = (n: number) => (n >= 90 ? "text-green-700" : n >= 70 ? "text-amber-700" : "text-red-700");

/** Kind of the paper and, when it was started from an assignment, a chip that opens the assignment (§4.3). */
function PaperChips({ th }: { th: Thesis }) {
  const t = useT();
  return (
    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
      <KindChip kind={th.kind ?? "thesis"} />
      {th.assignment && (
        <Link
          href={`/admin/assignments/${th.assignment.id}`}
          aria-label={t("assignments.paper.chipAria", { title: th.assignment.title })}
          title={th.assignment.title}
          className="relative z-10 inline-flex min-w-0 max-w-[16rem] items-center gap-1 rounded-[10px] bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ClipboardList className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {/* Papers keep their assignment's title unless renamed: then the chip just says "Assignment". */}
          <span className="truncate">{th.assignment.title.trim() === th.title.trim() ? t("glossary.assignment") : th.assignment.title}</span>
        </Link>
      )}
      {(th.deadline || th.submittedAt) && <DeadlineChip deadline={th.deadline} wordCount={th.wordCount} targetWords={th.targetWords} status={th.status} submittedAt={th.submittedAt} late={th.late} withDate />}
    </div>
  );
}

export default function AdminThesesPage() {
  const t = useT();
  const fmt = useFormat();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ theses: Thesis[] }>("/api/theses").then((d) => setTheses(d.theses)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = theses.filter((th) => (filter === "all" || (filter === "flagged" ? th.openFlags > 0 : th.status === filter)) && (!q || `${th.title} ${th.studentName} ${th.assignment?.title || ""}`.toLowerCase().includes(q.toLowerCase())));
  const teacher = (th: Thesis) => (th.professorId ? `${t(teacherRoleKey(th))}: ${th.professorName}` : t("papers.teacher.none"));
  const meta = (th: Thesis) => [teacher(th), plural(t, "admin.sessions", th.sessionCount), timeAgoLabel(t, fmt.date, th.updatedAt)].join(" · ");

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-5 min-w-0">
          <h1 className="text-2xl font-bold">{t("admin.theses.title")}</h1>
          <p className="text-gray-500 mt-1 text-sm text-pretty">{t("admin.theses.subtitle")}</p>
        </div>
        {/* Search and filters on their own row under the title: one line on desktop in every language. */}
        <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("common.search")}…`} aria-label={t("common.search")} className="input-field !py-2 !pl-9 text-sm" />
            </div>
            <div role="group" aria-label={t("admin.theses.filterAria")} className="flex flex-wrap gap-1.5">
              {["all", "in_progress", "under_review", "flagged", "draft"].map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
                >
                  {f === "all" ? t("common.all") : f === "flagged" ? t("admin.theses.filterWithNotices") : statusLabel(t, f)}
                </button>
              ))}
            </div>
        </div>
        {loading ? (
          <div className="card p-12 text-center text-gray-500">{t("common.loading")}…</div>
        ) : (
          <>
            {/* Phones and tablets: one card per paper (no horizontal table). */}
            <ul className="space-y-3 md:hidden">
              {filtered.map((th) => (
                <li key={th.id} className="card relative p-4">
                  <Link href={`/admin/theses/${th.id}`} className="block text-sm font-semibold text-gray-900 break-words after:absolute after:inset-0 after:rounded-2xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500">
                    {th.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-gray-500">{th.studentName}</div>
                  <PaperChips th={th} />
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
                    <span className={statusColors[th.status]}>{statusLabel(t, th.status)}</span>
                    <span>
                      {t("glossary.integrity")} <span className={`font-semibold ${scoreTone(th.integrityScore)}`}>{th.integrityScore}%</span>
                    </span>
                    <span>
                      {t("admin.ai")} <span className="font-semibold text-gray-900">{th.aiUsagePercent}%</span>
                    </span>
                    <span>{t("common.words", { n: fmt.number(th.wordCount) })}</span>
                    {th.openFlags > 0 && <span className="badge-warning">{plural(t, "admin.notices", th.openFlags)}</span>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="card hidden overflow-hidden md:block">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left py-3 px-5 w-[38%]">{t("admin.theses.colThesis")}</th>
                    <th className="text-left py-3 px-4">{t("admin.theses.colStudent")}</th>
                    <th className="text-left py-3 px-4">{t("admin.theses.colStatus")}</th>
                    <th className="text-center py-3 px-3">{t("glossary.integrity")}</th>
                    <th className="text-center py-3 px-3 w-16">{t("admin.ai")}</th>
                    <th className="text-center py-3 px-3">{t("admin.theses.colNotices")}</th>
                    <th className="text-right py-3 px-5">{t("admin.theses.colWords")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((th) => (
                    <tr key={th.id} className="hover:bg-gray-50 transition-colors align-top">
                      <td className="py-3.5 px-5">
                        <Link href={`/admin/theses/${th.id}`} className="text-sm font-medium block truncate hover:text-brand-700 focus:outline-none focus-visible:underline" title={th.title}>
                          {th.title}
                        </Link>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{meta(th)}</div>
                        <PaperChips th={th} />
                      </td>
                      <td className="py-3.5 px-4 text-sm text-gray-700 break-words">{th.studentName}</td>
                      <td className="py-3.5 px-4">
                        <span className={`${statusColors[th.status]} whitespace-nowrap`}>{statusLabel(t, th.status)}</span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`text-sm font-bold ${scoreTone(th.integrityScore)}`}>{th.integrityScore}%</span>
                      </td>
                      <td className="py-3.5 px-3 text-center text-sm text-prov-ai font-medium">{th.aiUsagePercent}%</td>
                      <td className="py-3.5 px-3 text-center">{th.openFlags > 0 ? <span className="badge-warning">{th.openFlags}</span> : <span className="text-gray-400" aria-label={t("common.none")}>–</span>}</td>
                      <td className="py-3.5 px-5 text-right text-sm text-gray-600 tabular-nums">{fmt.number(th.wordCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && <div className="card p-8 text-center text-sm text-gray-500 md:mt-0">{t("admin.theses.empty")}</div>}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
