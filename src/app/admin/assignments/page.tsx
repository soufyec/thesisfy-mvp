"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ClipboardList, Plus, UserPlus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Toast } from "@/components/ui";
import { AssignmentCard } from "@/components/assignments/AssignmentCard";
import { NewAssignmentModal } from "@/components/assignments/NewAssignmentModal";
import { byNearestDue, rosterTotal, type StaffAssignment, type StudentOption } from "@/components/assignments/types";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

/**
 * Assignments of a professor (or, for an admin, of the whole university): docs/papers.md §4.3. Open assignments by
 * nearest due date; closed ones folded under "Closed ({n})". Empty state with the next step: create one, or invite
 * students first when the university has none.
 */
export default function AssignmentsPage() {
  const t = useT();
  const fmt = useFormat();
  const [items, setItems] = useState<StaffAssignment[] | null>(null);
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api<{ assignments: StaffAssignment[] }>("/api/assignments")
      .then((d) => setItems(d.assignments))
      .catch(() => setFailed(true));
    api<{ students: StudentOption[] }>("/api/users")
      .then((d) => setStudents(d.students.map((s) => ({ id: s.id, name: s.name, email: s.email }))))
      .catch(() => setStudents([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = (items || []).filter((a) => a.status === "open").sort(byNearestDue);
  const closed = (items || []).filter((a) => a.status === "closed").sort(byNearestDue);
  const noStudents = students !== null && students.length === 0;

  const created = (a: StaffAssignment) => {
    setItems((list) => [a, ...(list || [])]);
    const n = rosterTotal(a.counts);
    setToast({ message: n === 1 ? t("assignments.new.sent_one") : t("assignments.new.sent", { n: fmt.number(n) }), kind: "success" });
  };

  const newButton = noStudents ? (
    <Link href="/admin/students" className="btn-outline !py-2.5 !px-4 text-sm self-start">
      <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
      {t("assignments.empty.noStudentsCta")}
    </Link>
  ) : (
    <button type="button" onClick={() => setCreating(true)} disabled={students === null} className="btn-primary !py-2.5 !px-4 self-start disabled:opacity-60">
      <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
      {t("assignments.new.button")}
    </button>
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">{t("assignments.page.title")}</h1>
            <p className="mt-1 max-w-2xl text-pretty text-sm text-gray-500">{t("assignments.page.subtitle")}</p>
          </div>
          {items && items.length > 0 && newButton}
        </div>

        {failed ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-gray-600">{t("assignments.page.loadFailed")}</p>
            <button type="button" onClick={load} className="btn-outline !py-2 !px-4 text-sm mt-4">
              {t("common.retry")}
            </button>
          </div>
        ) : items === null ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label={t("common.loading")}>
            {[0, 1].map((i) => (
              <div key={i} className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-20 rounded bg-gray-100" />
                    <div className="h-4 w-3/4 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="mt-5 h-2 w-full rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700" aria-hidden="true">
              <ClipboardList className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-gray-900">{t("assignments.empty.title")}</h2>
            <p className="mt-1.5 max-w-md text-pretty text-sm text-gray-500">{noStudents ? t("assignments.empty.noStudentsBody") : t("assignments.empty.body")}</p>
            <div className="mt-5">{newButton}</div>
          </div>
        ) : (
          <>
            {open.length > 0 ? (
              <section aria-labelledby="asg-open">
                <h2 id="asg-open" className="sr-only">
                  {t("assignments.status.open")}
                </h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {open.map((a) => (
                    <AssignmentCard key={a.id} assignment={a} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="card px-6 py-8 text-center text-sm text-gray-500">{t("assignments.page.noneOpen")}</div>
            )}

            {closed.length > 0 && (
              <details className="group mt-8">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-gray-700 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400 transition-transform group-open:rotate-0" aria-hidden="true" />
                  {t("assignments.page.closed", { n: fmt.number(closed.length) })}
                </summary>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {closed.map((a) => (
                    <AssignmentCard key={a.id} assignment={a} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <NewAssignmentModal open={creating} onClose={() => setCreating(false)} onCreated={created} students={students ?? undefined} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
