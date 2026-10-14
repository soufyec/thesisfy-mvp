"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n/client";
import { LOCALE_NAMES } from "@/lib/i18n";
import { WRITING_LANGUAGES, type WritingLanguage } from "@/lib/papers/kinds";

/** Writing language of a paper (D19): headings, table titles and chart labels; the interface keeps its own language. */
export function WritingLanguageField({ value, onChange, className = "" }: { value: WritingLanguage; onChange(v: WritingLanguage): void; className?: string }) {
  const t = useT();
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600">
        {t("papers.lang.label")}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as WritingLanguage)} aria-describedby={`${id}-help`} className="input-field !py-2 mt-1">
        {WRITING_LANGUAGES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
        {t("papers.lang.help")}
      </p>
    </div>
  );
}

export default WritingLanguageField;
