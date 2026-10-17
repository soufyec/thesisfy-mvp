"use client";
import { useEffect, useRef, useState, useId } from "react";
import { useT } from "@/lib/i18n/client";
import type { Effort } from "@/lib/ai/effort";
export default function EffortSelector({ value, options, onChange, disabled }: { value: Effort; options: Effort[]; onChange: (value: Effort) => void; disabled: boolean }) {
  const t = useT(); const id = useId(); const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<Effort | null>(null);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);
  return <div className="px-3 py-2 border-b border-gray-100 text-xs flex items-center gap-2">
    <label htmlFor={id} className="text-gray-600">{t("effort.label")}</label>
    <select id={id} value={value} disabled={disabled || options.length < 2} onChange={e => setPending(e.target.value as Effort)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-gray-900">
      {options.map(e => <option key={e} value={e}>{t(`effort.${e}`)}</option>)}
    </select>
    {options.length < 2 && <span className="text-gray-500">{t("effort.fixed")}</span>}
    <dialog ref={dialog} onCancel={() => setPending(null)} onClose={() => setPending(null)} aria-labelledby={`${id}-title`} className="rounded-2xl p-5 max-w-sm w-[calc(100vw-32px)] shadow-xl backdrop:bg-gray-900/30">
      <h2 id={`${id}-title`} className="font-semibold text-base mb-2">{t("effort.label")}: {pending && t(`effort.${pending}`)}</h2>
      <p className="text-sm text-gray-600 mb-4">{t("effort.notice")}</p>
      <div className="flex gap-2 justify-end"><button className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50" onClick={() => setPending(null)}>{t("effort.cancel")}</button><button className="btn-primary" onClick={() => { if (pending) onChange(pending); setPending(null); }}>{t("effort.confirm")}</button></div>
    </dialog>
  </div>;
}
