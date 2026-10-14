"use client";

import { useEffect, useState } from "react";
import { AssignmentBrief } from "@/components/assignments/AssignmentBrief";
import { DeadlineChip, KindChip, KindTile, Modal } from "@/components/ui";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import type { WritingLanguage } from "@/lib/papers/kinds";
import type { StudentAssignmentView } from "@/lib/papers/views";
import { briefPreview, FOCUS_RING } from "./paperList";
import { WritingLanguageField } from "./WritingLanguageField";

/**
 * An assignment the student has not started yet (docs/papers.md §4.1 item 2). "Start" creates the paper in the
 * interface language; "Read brief" opens the full brief, where the writing language can be chosen first.
 */
export function AssignedCard({ assignment: a, highlighted = false, starting = false, onReadBrief, onStart }: { assignment: StudentAssignmentView; highlighted?: boolean; starting?: boolean; onReadBrief(): void; onStart(): void }) {
  const t = useT();
  const fmt = useFormat();
  const preview = briefPreview(a.brief);
  const meta = [a.targetWords ? t("papers.assigned.target", { words: t("common.words", { n: fmt.number(a.targetWords) }) }) : "", a.citationStyle || ""].filter(Boolean).join(" · ");

  return (
    <article
      id={`assignment-${a.id}`}
      aria-labelledby={`assignment-${a.id}-title`}
      className={`card flex min-w-0 flex-col p-5 scroll-mt-24 motion-safe:transition-[box-shadow] ${highlighted ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-gray-50" : ""}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <KindTile kind={a.kind} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 id={`assignment-${a.id}-title`} className="text-base font-semibold leading-snug text-gray-900 break-words line-clamp-2">
            {a.title}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 break-words">{t("assignments.brief.assignedBy", { name: a.createdByName })}</p>
        </div>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
        <KindChip kind={a.kind} />
        <DeadlineChip deadline={a.deadline} status="not_started" />
        {meta && <span className="inline-flex items-center rounded-[10px] bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">{meta}</span>}
      </div>
      {preview && <p className="mt-3 text-sm leading-relaxed text-gray-600 line-clamp-2 break-words">{preview}</p>}
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onReadBrief} aria-label={t("papers.assigned.readBriefAria", { title: a.title })} className={`btn-outline !border !py-2 !px-3.5 text-sm ${FOCUS_RING}`}>
            {t("papers.assigned.readBrief")}
          </button>
          <button type="button" onClick={onStart} disabled={starting} aria-label={t("papers.assigned.startAria", { title: a.title })} className={`btn-primary !py-2 !px-4 text-sm disabled:opacity-50 ${FOCUS_RING}`}>
            {starting ? t("papers.assigned.starting") : t("papers.assigned.start")}
          </button>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-gray-500">{t("papers.assigned.consequence")}</p>
      </div>
    </article>
  );
}

/** The full brief of an assignment, the writing language and "Start" in the footer, after the consequence sentence. */
export function BriefModal({ assignment, starting = false, onClose, onStart }: { assignment: StudentAssignmentView | null; starting?: boolean; onClose(): void; onStart(lang: WritingLanguage): void }) {
  const t = useT();
  const { locale } = useLocale();
  const [lang, setLang] = useState<WritingLanguage>(locale);
  useEffect(() => {
    if (assignment) setLang(locale);
  }, [assignment, locale]);

  return (
    <Modal
      open={!!assignment}
      onClose={onClose}
      size="lg"
      title={t("glossary.assignment")}
      footer={
        <>
          <p className="w-full text-xs leading-relaxed text-gray-600">{t("papers.assigned.consequence")}</p>
          <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
            {t("common.close")}
          </button>
          <button type="button" onClick={() => onStart(lang)} disabled={starting || assignment?.status === "closed"} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50 disabled:shadow-none">
            {starting ? t("papers.assigned.starting") : t("papers.assigned.start")}
          </button>
        </>
      }
    >
      {assignment && (
        <>
          <AssignmentBrief view={assignment} />
          <div className="mt-5 border-t border-gray-100 pt-4">
            <WritingLanguageField value={lang} onChange={setLang} />
          </div>
        </>
      )}
    </Modal>
  );
}
