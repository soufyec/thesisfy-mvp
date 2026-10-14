"use client";

import { useEffect, useState } from "react";
import { Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { fromDateInput, toDateInput } from "@/lib/deadline";
import { useFormat, useT } from "@/lib/i18n/client";
import { templateFor } from "@/lib/papers/templates";
import { AssignmentFields, draftValid, targetValue, type AssignmentDraft } from "./AssignmentFields";
import { StudentPicker } from "./StudentPicker";
import type { StaffAssignment, StudentOption } from "./types";

const toDraft = (a: StaffAssignment): AssignmentDraft => ({
  title: a.title,
  brief: a.brief,
  due: toDateInput(a.deadline),
  target: String(a.targetWords ?? templateFor(a.kind).targetWords),
  style: a.citationStyle ?? "APA",
});

/**
 * Settings of an existing assignment (`PATCH /api/assignments/[id]`): title, brief, due date, word target, citation
 * style, and students to add. Recipients can only be added, never removed (the route merges them). Only the fields that
 * changed are sent, so an untouched brief does not notify anyone.
 */
export function EditAssignmentModal({ open, onClose, assignment, students, onSaved }: { open: boolean; onClose(): void; assignment: StaffAssignment; students: StudentOption[] | null; onSaved(a: StaffAssignment): void }) {
  const t = useT();
  const fmt = useFormat();
  const [draft, setDraft] = useState<AssignmentDraft>(() => toDraft(assignment));
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(assignment));
    setAdded([]);
    setError("");
    setBusy(false);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const original = toDraft(assignment);
  const patch: Record<string, unknown> = {};
  if (draft.title.trim() !== original.title.trim()) patch.title = draft.title.trim();
  if (draft.brief.trim() !== original.brief.trim()) patch.brief = draft.brief.trim();
  if (draft.due !== original.due) patch.deadline = fromDateInput(draft.due) ?? null;
  if (draft.target !== original.target) patch.targetWords = targetValue(draft.target);
  if (draft.style !== original.style) patch.citationStyle = draft.style;
  if (added.length) patch.studentIds = added;
  const changed = Object.keys(patch).length > 0;

  const others = (students || []).filter((s) => assignment.studentIds.indexOf(s.id) === -1);

  const save = async () => {
    if (!changed || !draftValid(draft) || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ assignment: StaffAssignment }>(`/api/assignments/${assignment.id}`, { method: "PATCH", json: patch });
      onSaved(d.assignment);
      onClose();
    } catch (e) {
      setError((e as Error).message || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("assignments.edit.title")}
      size="lg"
      footer={
        <>
          <p className="w-full text-xs leading-relaxed text-gray-600">{t("assignments.edit.consequence")}</p>
          <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={save} disabled={!changed || !draftValid(draft) || busy} className="btn-primary !py-2 !px-5 text-sm disabled:opacity-40 disabled:shadow-none">
            {busy && <Spinner className="w-4 h-4 mr-2" />}
            {t("assignments.edit.save")}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <AssignmentFields draft={draft} onChange={setDraft} kind={assignment.kind} createdByName={assignment.createdByName} status={assignment.status} allowPastDue />

        <div>
          {students === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner />
              {t("common.loading")}…
            </div>
          ) : others.length ? (
            <StudentPicker
              students={others}
              value={added}
              onChange={setAdded}
              label={t("assignments.edit.addStudents")}
              help={t(assignment.studentIds.length === 1 ? "assignments.edit.alreadyIn_one" : "assignments.edit.alreadyIn", { n: fmt.number(assignment.studentIds.length) })}
            />
          ) : (
            <>
              <div className="text-sm font-medium text-gray-900">{t("assignments.edit.addStudents")}</div>
              <p className="mt-1 text-sm text-gray-500">{t("assignments.edit.noMore")}</p>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default EditAssignmentModal;
