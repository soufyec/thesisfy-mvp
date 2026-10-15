"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { KindTile, Modal, Spinner } from "@/components/ui";
import { TemplateFilterChips, TemplateGallery } from "@/components/papers/TemplateGallery";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";
import { fromDateInput } from "@/lib/deadline";
import { useFormat, useT } from "@/lib/i18n/client";
import type { PaperGroup, PaperKind } from "@/lib/papers/kinds";
import { templateFor } from "@/lib/papers/templates";
import { AssignmentFields, draftValid, targetValue, type AssignmentDraft } from "./AssignmentFields";
import { StudentPicker } from "./StudentPicker";
import type { StaffAssignment, StudentOption } from "./types";

const emptyDraft = (): AssignmentDraft => ({ title: "", brief: "", due: "", target: "", style: "APA" });

/**
 * "New assignment" (docs/papers.md §4.3), a two-step `xl` dialog: (1) the kind of paper, from the template gallery;
 * (2) title, brief, due date, word target, citation style and students. `preselect` opens it with those students
 * already chosen (the "Assign work" button of the students page). Pass `students` when the page already has them;
 * otherwise the dialog loads the university's students itself.
 */
export function NewAssignmentModal({ open, onClose, onCreated, preselect, students: given }: { open: boolean; onClose(): void; onCreated(a: StaffAssignment): void; preselect?: string[]; students?: StudentOption[] }) {
  const t = useT();
  const fmt = useFormat();
  const { user } = useUser();
  const [step, setStep] = useState<1 | 2>(1);
  const [group, setGroup] = useState<PaperGroup | "all">("all");
  const [kind, setKind] = useState<PaperKind | undefined>();
  const [draft, setDraft] = useState<AssignmentDraft>(emptyDraft);
  const [picked, setPicked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<StudentOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** The default title for the current kind, so changing the kind only replaces a title the teacher has not edited. */
  const defaultTitle = useRef("");
  const students = given ?? loaded;

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setGroup("all");
    setKind(undefined);
    setDraft(emptyDraft());
    setPicked(preselect ? [...preselect] : []);
    setError("");
    setBusy(false);
    defaultTitle.current = "";
    if (!given) {
      api<{ students: StudentOption[] }>("/api/users")
        .then((d) => setLoaded(d.students.map((s) => ({ id: s.id, name: s.name, email: s.email }))))
        .catch(() => setLoaded([]));
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickKind = (k: PaperKind) => {
    const title = `${t(`papers.kind.${k}`)}: `;
    setDraft((d) => ({
      ...d,
      title: !d.title.trim() || d.title === defaultTitle.current ? title : d.title,
      target: !d.target || (kind && d.target === String(templateFor(kind).targetWords)) ? String(templateFor(k).targetWords) : d.target,
    }));
    defaultTitle.current = title;
    setKind(k);
    setStep(2);
  };

  const ready = !!kind && draftValid(draft) && picked.length > 0;

  const submit = async () => {
    if (!kind || !ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ assignment: StaffAssignment }>("/api/assignments", {
        method: "POST",
        json: {
          title: draft.title.trim(),
          brief: draft.brief.trim(),
          kind,
          templateId: templateFor(kind).id,
          studentIds: picked,
          deadline: fromDateInput(draft.due),
          targetWords: targetValue(draft.target),
          citationStyle: draft.style,
        },
      });
      onCreated(d.assignment);
      onClose();
    } catch (e) {
      setError((e as Error).message || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const tpl = kind ? templateFor(kind) : undefined;
  const noStudents = students !== null && students.length === 0;

  const footer =
    step === 1 ? (
      <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
        {t("common.cancel")}
      </button>
    ) : (
      <>
        <p className="w-full text-xs leading-relaxed text-gray-600">{t("assignments.new.consequence")}</p>
        <button type="button" onClick={() => setStep(1)} className="btn-outline !py-2 !px-4 text-sm mr-auto">
          <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
          {t("common.back")}
        </button>
        <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
          {t("common.cancel")}
        </button>
        <button type="button" onClick={submit} disabled={!ready || busy} className="btn-primary !py-2 !px-5 text-sm disabled:opacity-40 disabled:shadow-none">
          {busy && <Spinner className="w-4 h-4 mr-2" />}
          {busy ? t("assignments.new.assigning") : t("assignments.new.assign")}
        </button>
      </>
    );

  return (
    <Modal open={open} onClose={onClose} title={t("assignments.new.title")} size="xl" footer={footer}>
      <ol className="mb-5 flex items-center gap-2 text-xs" aria-label={t("assignments.new.stepsAria")}>
        {[1, 2].map((n) => (
          <li key={n} className="flex items-center gap-2" aria-current={step === n ? "step" : undefined}>
            {n === 2 && <span aria-hidden="true" className="h-px w-6 bg-gray-200" />}
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${step === n ? "bg-brand-600 text-white" : step > n ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"}`}>{n}</span>
            <span className={step === n ? "font-semibold text-gray-900" : "text-gray-500"}>{t(n === 1 ? "assignments.new.step1" : "assignments.new.step2")}</span>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div>
          <h3 className="text-base font-semibold text-gray-900">{t("assignments.new.kindTitle")}</h3>
          <p className="mt-1 text-sm text-gray-500">{t("assignments.new.kindHelp")}</p>
          <div className="mt-4">
            <TemplateFilterChips value={group} onChange={setGroup} />
          </div>
          <div className="mt-3">
            <TemplateGallery compact selected={kind} filter={group} onPick={pickKind} />
          </div>
        </div>
      ) : (
        kind &&
        tpl && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
              <KindTile kind={kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-900">{t(`papers.kind.${kind}`)}</div>
                <div className="truncate text-xs text-gray-500">{tpl.sections.length ? t("papers.gallery.words", { words: fmt.number(tpl.targetWords), sections: tpl.sections.length }) : t("papers.gallery.empty")}</div>
              </div>
              <button type="button" onClick={() => setStep(1)} className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                {t("assignments.new.changeKind")}
              </button>
            </div>

            <AssignmentFields draft={draft} onChange={setDraft} kind={kind} createdByName={user?.name || ""} autoFocusTitle />

            {students === null ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Spinner />
                {t("common.loading")}…
              </div>
            ) : noStudents ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-600">
                <p>{t("assignments.empty.noStudentsBody")}</p>
                <Link href="/admin/students" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {t("assignments.empty.noStudentsCta")}
                </Link>
              </div>
            ) : (
              <StudentPicker students={students} value={picked} onChange={setPicked} label={t("assignments.form.students")} />
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        )
      )}
    </Modal>
  );
}

export default NewAssignmentModal;
