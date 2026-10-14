"use client";

import { useId, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n/client";
import { initials, type StudentOption } from "./types";

/** Chips shown above the list before collapsing into "+N more". */
const MAX_CHIPS = 12;

/**
 * Recipients of an assignment (docs/papers.md §4.3): search, "Select all" (of the students the search shows), chips
 * for the chosen ones, and a scrollable checklist. Controlled: `value` holds the chosen student ids.
 */
export function StudentPicker({ students, value, onChange, label, help }: { students: StudentOption[]; value: string[]; onChange(ids: string[]): void; label: string; help?: string }) {
  const t = useT();
  const fmt = useFormat();
  const uid = useId();
  const [q, setQ] = useState("");
  const chosen = useMemo(() => new Set(value), [value]);
  const query = q.trim().toLowerCase();
  const visible = useMemo(() => (query ? students.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(query)) : students), [students, query]);
  const allVisibleChosen = visible.length > 0 && visible.every((s) => chosen.has(s.id));
  const chips = students.filter((s) => chosen.has(s.id));

  const toggle = (id: string) => onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const toggleAll = () => {
    const ids = new Set(visible.map((s) => s.id));
    onChange(allVisibleChosen ? value.filter((v) => !ids.has(v)) : Array.from(new Set([...value, ...visible.map((s) => s.id)])));
  };

  return (
    <div role="group" className="min-w-0" aria-labelledby={`${uid}-label`} aria-describedby={help ? `${uid}-help` : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={`${uid}-label`} className="text-sm font-medium text-gray-900">
          {label}
        </span>
        <span className="text-xs text-gray-500 tabular-nums" aria-live="polite">
          {value.length === 1 ? t("assignments.picker.selected_one") : t("assignments.picker.selected", { n: fmt.number(value.length) })}
        </span>
      </div>
      {help && (
        <p id={`${uid}-help`} className="text-xs text-gray-500 mt-0.5">
          {help}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("assignments.picker.search")}
            aria-label={t("assignments.picker.search")}
            className="input-field !py-2 !pl-9"
          />
        </div>
        <button
          type="button"
          onClick={toggleAll}
          disabled={!visible.length}
          className="flex-shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {allVisibleChosen ? t("assignments.picker.clearAll") : t("assignments.picker.selectAll")}
        </button>
      </div>

      {chips.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t("assignments.picker.chosenAria")}>
          {chips.slice(0, MAX_CHIPS).map((s) => (
            <li key={s.id} className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-[10px] bg-brand-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-brand-700">
              <span className="truncate">{s.name}</span>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-label={t("assignments.picker.remove", { name: s.name })}
                className="flex-shrink-0 rounded-md p-0.5 hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
          {chips.length > MAX_CHIPS && <li className="inline-flex items-center rounded-[10px] bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">{t("assignments.picker.more", { n: fmt.number(chips.length - MAX_CHIPS) })}</li>}
        </ul>
      )}

      <ul className="mt-2.5 max-h-56 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-100">
        {visible.map((s) => {
          const on = chosen.has(s.id);
          return (
            <li key={s.id}>
              <label className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${on ? "bg-brand-50/60" : "hover:bg-gray-50"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="peer sr-only" />
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-1 ${on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"}`}
                >
                  {on && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span aria-hidden="true" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{s.name}</span>
                  <span className="block truncate text-xs text-gray-500">{s.email}</span>
                </span>
              </label>
            </li>
          );
        })}
        {!visible.length && <li className="px-3 py-4 text-center text-sm text-gray-500">{query ? t("assignments.picker.noMatch", { q: q.trim() }) : t("assignments.picker.none")}</li>}
      </ul>
    </div>
  );
}

export default StudentPicker;
