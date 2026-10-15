"use client";

import { useId, useRef, useState } from "react";
import { Eye, PenLine, ShieldCheck } from "lucide-react";
import { fromDateInput } from "@/lib/deadline";
import { useFormat, useT } from "@/lib/i18n/client";
import type { PaperKind } from "@/lib/papers/kinds";
import type { AssignmentStatus, AssignmentView, CitationStyle } from "@/lib/papers/views";
import { AssignmentBrief } from "./AssignmentBrief";
import { BRIEF_MAX, CITATION_STYLES, TARGET_MAX, TARGET_MIN, TITLE_MAX } from "./types";

/** The editable part of an assignment, as the form holds it (`due` is the `<input type="date">` value). */
export interface AssignmentDraft {
  title: string;
  brief: string;
  due: string;
  target: string;
  style: CitationStyle;
}

export const targetValue = (s: string): number | null => {
  const n = Number(s);
  return Number.isInteger(n) && n >= TARGET_MIN && n <= TARGET_MAX ? n : null;
};

export const draftValid = (d: AssignmentDraft) => d.title.trim().length > 0 && d.title.trim().length <= TITLE_MAX && d.brief.length <= BRIEF_MAX && targetValue(d.target) !== null;

const today = () => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

const label = "block text-sm font-medium text-gray-900";
const hint = "mt-1 text-xs text-gray-500";

/**
 * Title, brief (with an Edit/Preview switch that renders the brief exactly as students will see it), due date, word
 * target and citation style. Shared by the new-assignment modal and the settings dialog of an assignment.
 */
export function AssignmentFields({ draft, onChange, kind, createdByName, status = "open", allowPastDue = false, autoFocusTitle = false }: { draft: AssignmentDraft; onChange(d: AssignmentDraft): void; kind: PaperKind; createdByName: string; status?: AssignmentStatus; allowPastDue?: boolean; autoFocusTitle?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const uid = useId();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const caretPlaced = useRef(false);
  const set = (patch: Partial<AssignmentDraft>) => onChange({ ...draft, ...patch });
  const targetBad = draft.target !== "" && targetValue(draft.target) === null;
  const nearLimit = draft.brief.length > BRIEF_MAX * 0.95;

  const preview: AssignmentView = {
    id: "preview",
    title: draft.title.trim() || t(`papers.kind.${kind}`),
    brief: draft.brief,
    kind,
    createdBy: "",
    createdByName,
    deadline: fromDateInput(draft.due),
    targetWords: targetValue(draft.target) ?? undefined,
    citationStyle: draft.style,
    status,
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${uid}-title`} className={label}>
          {t("assignments.form.title")}
        </label>
        <input
          id={`${uid}-title`}
          value={draft.title}
          maxLength={TITLE_MAX}
          autoFocus={autoFocusTitle}
          onFocus={(e) => {
            // The first (automatic) focus puts the caret after the default "Essay: " prefix; later clicks are left alone.
            if (!autoFocusTitle || caretPlaced.current) return;
            caretPlaced.current = true;
            const el = e.currentTarget;
            const end = el.value.length;
            requestAnimationFrame(() => el.setSelectionRange(end, end));
          }}
          onChange={(e) => set({ title: e.target.value })}
          className="input-field !py-2.5 mt-1.5"
          required
        />
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label htmlFor={`${uid}-brief`} className={label}>
            {t("glossary.brief")}
          </label>
          <div role="group" aria-label={t("assignments.form.briefModeAria")} className="inline-flex rounded-lg bg-gray-100 p-0.5">
            {(["edit", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
              >
                {m === "edit" ? <PenLine className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                {t(m === "edit" ? "assignments.form.briefEdit" : "assignments.form.briefPreview")}
              </button>
            ))}
          </div>
        </div>
        {mode === "edit" ? (
          <textarea
            id={`${uid}-brief`}
            value={draft.brief}
            maxLength={BRIEF_MAX}
            rows={7}
            onChange={(e) => set({ brief: e.target.value })}
            placeholder={t("assignments.form.briefPlaceholder")}
            aria-describedby={`${uid}-brief-count ${uid}-brief-guard`}
            className="input-field mt-1.5 resize-y leading-relaxed"
          />
        ) : (
          <div className="mt-1.5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <AssignmentBrief view={preview} />
            </div>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p id={`${uid}-brief-guard`} className="inline-flex items-start gap-1.5 text-xs text-gray-600">
            <ShieldCheck className="mt-px h-3.5 w-3.5 flex-shrink-0 text-brand-600" aria-hidden="true" />
            {t("assignments.form.briefGuard")}
          </p>
          <span id={`${uid}-brief-count`} className={`text-xs tabular-nums ${nearLimit ? "font-semibold text-amber-700" : "text-gray-500"}`}>
            {t("assignments.form.briefCount", { n: fmt.number(draft.brief.length), max: fmt.number(BRIEF_MAX) })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${uid}-due`} className={label}>
            {t("assignments.brief.due")}
          </label>
          <input id={`${uid}-due`} type="date" value={draft.due} min={allowPastDue ? undefined : today()} onChange={(e) => set({ due: e.target.value })} className="input-field !py-2.5 mt-1.5" />
          <p className={hint}>{t("common.optional")}</p>
        </div>
        <div>
          <label htmlFor={`${uid}-target`} className={label}>
            {t("assignments.brief.target")}
          </label>
          <input
            id={`${uid}-target`}
            type="number"
            inputMode="numeric"
            min={TARGET_MIN}
            max={TARGET_MAX}
            step={100}
            value={draft.target}
            onChange={(e) => set({ target: e.target.value })}
            aria-invalid={targetBad || undefined}
            aria-describedby={`${uid}-target-help`}
            className={`input-field !py-2.5 mt-1.5 ${targetBad ? "!border-red-400" : ""}`}
          />
          <p id={`${uid}-target-help`} className={`${hint} ${targetBad ? "!text-red-700" : ""}`}>
            {t("assignments.form.targetHelp", { min: fmt.number(TARGET_MIN), max: fmt.number(TARGET_MAX) })}
          </p>
        </div>
        <div>
          <label htmlFor={`${uid}-style`} className={label}>
            {t("assignments.brief.citationStyle")}
          </label>
          <select id={`${uid}-style`} value={draft.style} onChange={(e) => set({ style: e.target.value as CitationStyle })} className="input-field !py-2.5 mt-1.5">
            {CITATION_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default AssignmentFields;
