"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Lock, LockOpen, Settings2, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { KindTile, Toast } from "@/components/ui";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { AssignmentBrief } from "@/components/assignments/AssignmentBrief";
import { AssignmentStatusBar } from "@/components/assignments/AssignmentStatusBar";
import { AssignmentDue } from "@/components/assignments/AssignmentCard";
import { EditAssignmentModal } from "@/components/assignments/EditAssignmentModal";
import { RosterList } from "@/components/assignments/RosterList";
import { handedIn, nobodyStarted, rosterTotal, type StaffAssignment, type StudentOption } from "@/components/assignments/types";
import { api, ApiError } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

/**
 * One assignment for its creator or the university admin (docs/papers.md §4.3): the brief exactly as students see it,
 * its settings, the roster as a list of cards, close/reopen, and delete while nobody has started it.
 */
export default function AssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const fmt = useFormat();
  const [a, setA] = useState<StaffAssignment | null>(null);
  const [missing, setMissing] = useState(false);
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "reopen" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);

  const load = useCallback(() => {
    api<{ assignment: StaffAssignment }>(`/api/assignments/${params.id}`)
      .then((d) => {
        // A student view has no roster: this page is for staff only.
        if (!d.assignment.roster) setMissing(true);
        else setA(d.assignment);
      })
      .catch(() => setMissing(true));
  }, [params.id]);
  useEffect(() => {
    load();
    api<{ students: StudentOption[] }>("/api/users")
      .then((d) => setStudents(d.students.map((s) => ({ id: s.id, name: s.name, email: s.email }))))
      .catch(() => setStudents([]));
  }, [load]);

  const setStatus = async (status: "open" | "closed") => {
    if (!a) return;
    setBusy(true);
    try {
      const d = await api<{ assignment: StaffAssignment }>(`/api/assignments/${a.id}`, { method: "PATCH", json: { status } });
      setA(d.assignment);
      setToast({ message: t(status === "closed" ? "assignments.detail.closedToast" : "assignments.detail.reopenedToast"), kind: "success" });
    } catch (e) {
      setToast({ message: (e as Error).message || t("common.error"), kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!a) return;
    setBusy(true);
    try {
      await api(`/api/assignments/${a.id}`, { method: "DELETE" });
      router.push("/admin/assignments");
    } catch (e) {
      setToast({ message: (e as Error).message || t("common.error"), kind: "error" });
      // 409 started: someone started meanwhile; show the current roster.
      if (e instanceof ApiError && e.code === "started") load();
      setBusy(false);
    }
  };

  if (missing)
    return (
      <DashboardLayout>
        <div className="card max-w-lg p-8">
          <h1 className="mb-2 text-lg font-semibold">{t("assignments.detail.notFound")}</h1>
          <p className="mb-4 text-sm text-gray-500">{t("assignments.detail.notFoundHelp")}</p>
          <Link href="/admin/assignments" className="btn-outline !py-2 !px-4 text-sm">
            {t("assignments.page.title")}
          </Link>
        </div>
      </DashboardLayout>
    );
  if (!a)
    return (
      <DashboardLayout>
        <div className="text-sm text-gray-500">{t("common.loading")}…</div>
      </DashboardLayout>
    );

  const closed = a.status === "closed";
  const total = rosterTotal(a.counts);
  const canDelete = nobodyStarted(a);

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <nav aria-label={t("assignments.detail.breadcrumbAria")} className="mb-3 flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
          <Link href="/admin/assignments" className="hover:text-brand-700 hover:underline">
            {t("assignments.page.title")}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate text-gray-700">{a.title}</span>
        </nav>

        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <KindTile kind={a.kind} className="mt-1" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="font-medium">{t(`papers.kind.${a.kind}`)}</span>
                <span aria-hidden="true">·</span>
                {closed ? (
                  <span className="inline-flex items-center gap-1 rounded-[10px] bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("assignments.status.closed")}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-[10px] bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">{t("assignments.status.open")}</span>
                )}
              </div>
              <h1 className="mt-1 break-words font-display text-2xl font-bold leading-tight tracking-[-0.01em]">{a.title}</h1>
              <p className="mt-1.5 text-sm text-gray-500">{t("assignments.detail.meta", { name: a.createdByName, date: fmt.date(a.createdAt) })}</p>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-outline !py-2 !px-3 sm:!px-4 text-sm">
              <Settings2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t("assignments.detail.edit")}
            </button>
            <button type="button" onClick={() => setConfirm(closed ? "reopen" : "close")} disabled={busy} className="btn-outline !py-2 !px-3 sm:!px-4 text-sm disabled:opacity-50">
              {closed ? <LockOpen className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Lock className="w-4 h-4 mr-1.5" aria-hidden="true" />}
              {t(closed ? "assignments.detail.reopen" : "assignments.detail.close")}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          <section className="min-w-0 lg:col-span-2 lg:row-start-1" aria-labelledby="asg-roster">
            <div className="card mb-4 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="asg-roster" className="text-base font-semibold text-gray-900">
                  {t("assignments.detail.students")}
                  <span className="ml-2 text-sm font-normal text-gray-500">{fmt.number(total)}</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <AssignmentDue deadline={a.deadline} closed={closed} />
                  <span className="font-medium text-gray-700">{t("assignments.card.submitted", { n: fmt.number(handedIn(a.counts)), total: fmt.number(total) })}</span>
                </div>
              </div>
              <AssignmentStatusBar counts={a.counts} className="mt-4" />
            </div>
            <RosterList rows={a.roster} deadline={a.deadline} />
            <p className="mt-4 text-xs text-gray-500">{t("assignments.detail.consentNote")}</p>
          </section>

          <aside className="space-y-6 lg:col-start-3 lg:row-start-1">
            <section className="card p-5" aria-labelledby="asg-brief">
              <h2 id="asg-brief" className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("assignments.detail.studentView")}
              </h2>
              <AssignmentBrief view={a} />
            </section>

            <section className="card p-5" aria-labelledby="asg-manage">
              <h2 id="asg-manage" className="text-sm font-semibold text-gray-900">
                {t("assignments.detail.manage")}
              </h2>
              {canDelete ? (
                <>
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{t("assignments.detail.deleteHelp")}</p>
                  <button type="button" onClick={() => setConfirm("delete")} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("assignments.detail.delete")}
                  </button>
                </>
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{t("assignments.detail.deleteStarted")}</p>
              )}
            </section>
          </aside>
        </div>
      </div>

      <EditAssignmentModal
        open={editing}
        onClose={() => setEditing(false)}
        assignment={a}
        students={students}
        onSaved={(n) => {
          setA(n);
          setToast({ message: t("assignments.detail.savedToast"), kind: "success" });
        }}
      />
      <ConfirmDialog
        open={confirm === "close" || confirm === "reopen"}
        onClose={() => setConfirm(null)}
        title={t(confirm === "reopen" ? "assignments.detail.reopenTitle" : "assignments.detail.closeTitle")}
        body={t(confirm === "reopen" ? "assignments.detail.reopenBody" : "assignments.detail.closeBody")}
        confirmLabel={t(confirm === "reopen" ? "assignments.detail.reopen" : "assignments.detail.close")}
        onConfirm={() => setStatus(confirm === "reopen" ? "open" : "closed")}
      />
      <ConfirmDialog open={confirm === "delete"} onClose={() => setConfirm(null)} title={t("assignments.detail.deleteTitle")} body={t("assignments.detail.deleteBody")} confirmLabel={t("assignments.detail.delete")} danger onConfirm={remove} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
