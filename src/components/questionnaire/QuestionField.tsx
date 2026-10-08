"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n/client";
import { AnswerValue, Item, Mode, OTHER_PREFIX, paragraphsFor } from "@/lib/questionnaire";

interface Props {
  item: Item;
  fieldKey: string;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  mode: Mode;
  error?: boolean;
  /** Team editing: show phrasings even outside interview mode and the removal controls. */
  editing?: boolean;
  onRemovePhrasing?: (id: string) => void;
}

const isOther = (v: string) => v.startsWith(OTHER_PREFIX);

/** One question, rendered from its JSON definition. Tap targets are large: interviews are done on a phone. */
export default function QuestionField({ item, fieldKey, value, onChange, mode, error, editing, onRemovePhrasing }: Props) {
  const t = useT();
  const id = useId();
  const help = paragraphsFor(item.help, mode);
  const phrasings = item.phrasings || [];
  const showPhrasings = phrasings.length > 0 && (mode === "entretien" || editing);

  const choice = (checked: boolean) =>
    `flex items-start gap-3 rounded-xl border px-4 py-3 text-[14px] leading-snug cursor-pointer transition-colors ${checked ? "border-brand-500 bg-brand-50 text-gray-900" : "border-gray-200 bg-white text-gray-800 hover:border-brand-300"}`;

  const renderOtherInput = (current: string, set: (text: string) => void) => (
    <input
      type="text"
      className="input-field !py-2 mt-2"
      value={current.slice(OTHER_PREFIX.length)}
      onChange={(e) => set(e.target.value)}
      placeholder={t("q.otherPlaceholder")}
      aria-label={`${item.title} — ${t("q.other")}`}
      maxLength={300}
    />
  );

  let field: React.ReactNode = null;
  switch (item.type) {
    case "mc": {
      const v = typeof value === "string" ? value : "";
      field = (
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={`${id}-title`}>
          {(item.choices || []).map((c) => (
            <label key={c} className={choice(v === c)}>
              <input type="radio" name={fieldKey} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-600" checked={v === c} onChange={() => onChange(c)} />
              <span>{c}</span>
            </label>
          ))}
          {item.other && (
            <div className={choice(isOther(v))}>
              <input type="radio" name={fieldKey} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-600" checked={isOther(v)} onChange={() => onChange(OTHER_PREFIX)} aria-label={t("q.other")} />
              <div className="flex-1">
                <span>{t("q.other")}</span>
                {isOther(v) && renderOtherInput(v, (text) => onChange(OTHER_PREFIX + text))}
              </div>
            </div>
          )}
        </div>
      );
      break;
    }
    case "cb": {
      const v = Array.isArray(value) ? value : [];
      const full = !!item.max && v.length >= item.max;
      const toggle = (c: string) => onChange(v.includes(c) ? v.filter((x) => x !== c) : [...v, c]);
      const otherValue = v.find(isOther);
      field = (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-title`}>
          {item.max && <p className="text-[12px] text-gray-500 -mt-1">{t("q.maxChoices", { max: item.max })}</p>}
          {(item.choices || []).map((c) => {
            const checked = v.includes(c);
            const disabled = !checked && full;
            return (
              <label key={c} className={`${choice(checked)} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-shrink-0 rounded accent-brand-600" checked={checked} disabled={disabled} onChange={() => toggle(c)} />
                <span>{c}</span>
              </label>
            );
          })}
          {item.other && (
            <div className={`${choice(!!otherValue)} ${!otherValue && full ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded accent-brand-600"
                checked={!!otherValue}
                disabled={!otherValue && full}
                onChange={() => onChange(otherValue ? v.filter((x) => !isOther(x)) : [...v, OTHER_PREFIX])}
                aria-label={t("q.other")}
              />
              <div className="flex-1">
                <span>{t("q.other")}</span>
                {otherValue !== undefined && renderOtherInput(otherValue, (text) => onChange(v.map((x) => (isOther(x) ? OTHER_PREFIX + text : x))))}
              </div>
            </div>
          )}
        </div>
      );
      break;
    }
    case "scale": {
      const min = item.min ?? 1;
      const max = item.max ?? 5;
      const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      field = (
        <div role="radiogroup" aria-labelledby={`${id}-title`}>
          <div className="flex flex-wrap gap-2">
            {steps.map((n) => {
              const checked = value === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange(n)}
                  className={`min-w-[44px] h-11 px-3 rounded-xl border text-[15px] font-semibold transition-colors ${checked ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-gray-200 text-gray-800 hover:border-brand-300"}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {(item.low || item.high) && (
            <div className="flex justify-between gap-4 mt-2 text-[12px] text-gray-500">
              <span>
                {min} · {item.low}
              </span>
              <span className="text-right">
                {max} · {item.high}
              </span>
            </div>
          )}
        </div>
      );
      break;
    }
    case "grid": {
      const v = (typeof value === "object" && value && !Array.isArray(value) ? value : {}) as Record<string, string>;
      field = (
        <div className="flex flex-col gap-4">
          {(item.rows || []).map((row) => (
            <fieldset key={row} className="min-w-0">
              <legend className="text-[14px] text-gray-800 mb-2">{row}</legend>
              <div className="flex flex-wrap gap-2">
                {(item.cols || []).map((col) => {
                  const checked = v[row] === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => onChange({ ...v, [row]: col })}
                      className={`px-3 h-9 rounded-[10px] border text-[13px] transition-colors ${checked ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-brand-300"}`}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      );
      break;
    }
    case "text":
      field = <input id={`${id}-input`} type="text" className="input-field" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={t("q.textPlaceholder")} maxLength={4000} aria-labelledby={`${id}-title`} />;
      break;
    case "para":
      field = <textarea id={`${id}-input`} className="input-field min-h-[110px] resize-y" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={t("q.textPlaceholder")} maxLength={4000} aria-labelledby={`${id}-title`} />;
      break;
  }

  return (
    <div id={`field-${fieldKey}`} className={`rounded-2xl ${error ? "ring-2 ring-red-500/40 p-3 -m-3" : ""}`} data-key={fieldKey}>
      <div className="mb-3">
        <p id={`${id}-title`} className="text-[15px] font-semibold text-gray-900 leading-snug">
          {item.title}
          {item.req ? <span className="text-red-600" aria-label={t("q.required")}> *</span> : <span className="ml-2 text-[12px] font-normal text-gray-400">{t("q.optional")}</span>}
        </p>
        {item.interviewerOnly && <span className="inline-block mt-1 text-[11px] font-medium uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">{t("q.interviewer.badge")}</span>}
        {help.map((h) => (
          <p key={h} className={`mt-1 text-[13px] ${/^Entretien\s*:/.test(h) ? "text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 inline-block" : "text-gray-500"}`}>
            {h}
          </p>
        ))}
        {showPhrasings && (
          <div className="mt-2 rounded-xl bg-brand-50/70 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{t("q.phrasings.title")}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {phrasings.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 text-[13px] text-gray-800">
                  <span>
                    {p.text}
                    {p.author && <span className="text-gray-400"> — {p.author}</span>}
                  </span>
                  {editing && onRemovePhrasing && (
                    <button type="button" className="text-[12px] text-gray-500 hover:text-red-600 flex-shrink-0" onClick={() => onRemovePhrasing(p.id)}>
                      {t("q.team.remove")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {field}
      {error && <p className="mt-2 text-[12px] text-red-600">{t("q.required")}</p>}
    </div>
  );
}
