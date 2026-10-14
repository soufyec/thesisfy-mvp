"use client";

import { Check, Lock } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { CHIP } from "./LibraryItemRow";

/** id of the visually hidden sentence that explains why a locked thesis cannot change (rendered once per page). */
export const lockedHintId = (thesisId: string) => `library-locked-${thesisId}`;

/**
 * The hidden explanation every locked toggle points to with `aria-describedby`. Render it once per thesis on a page
 * (and once more inside a dialog, with a different `scope`, so the ids stay unique).
 */
export function LockedHints({ theses, scope = "" }: { theses: { id: string; locked: boolean }[]; scope?: string }) {
  const t = useT();
  return (
    <>
      {theses
        .filter((x) => x.locked)
        .map((x) => (
          <span key={x.id} id={lockedHintId(scope + x.id)} className="sr-only">
            {t("dashboard.sources.lockedHint")}
          </span>
        ))}
    </>
  );
}

/**
 * Small toggle chip "this item is used in <thesis>". Locked theses keep the chip focusable (aria-disabled, not
 * disabled) so the tooltip and the description still reach the reader; `onLocked` explains instead of toggling.
 */
export function ThesisToggleChip({ title, on, locked, busy, onToggle, onLocked, describedBy }: { title: string; on: boolean; locked?: boolean; busy?: boolean; onToggle: () => void; onLocked?: () => void; describedBy?: string }) {
  const t = useT();
  const tone = on ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={locked || busy || undefined}
      aria-label={t("dashboard.sources.toggleAria", { title })}
      aria-describedby={locked ? describedBy : undefined}
      title={locked ? t("dashboard.sources.lockedHint") : title}
      onClick={() => (locked ? onLocked?.() : busy ? undefined : onToggle())}
      className={`${CHIP} border max-w-[14rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${tone} ${locked ? "opacity-60 cursor-not-allowed" : ""} ${busy ? "opacity-60 cursor-wait" : ""}`}
    >
      {locked ? <Lock className="w-[15px] h-[15px] flex-shrink-0" aria-hidden="true" /> : on ? <Check className="w-[15px] h-[15px] flex-shrink-0" aria-hidden="true" /> : null}
      <span className="truncate">{title}</span>
    </button>
  );
}

/** The single-thesis control: a clear checkbox "Used in this thesis". */
export function UsedCheckbox({ on, locked, busy, onToggle, onLocked, describedBy }: { on: boolean; locked?: boolean; busy?: boolean; onToggle: () => void; onLocked?: () => void; describedBy?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-disabled={locked || busy || undefined}
      aria-describedby={locked ? describedBy : undefined}
      title={locked ? t("dashboard.sources.lockedHint") : undefined}
      onClick={() => (locked ? onLocked?.() : busy ? undefined : onToggle())}
      className={`inline-flex items-center gap-2 rounded-lg px-2 py-1 -ml-2 text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${on ? "text-brand-700" : "text-gray-700"} ${locked ? "opacity-60 cursor-not-allowed" : busy ? "opacity-60 cursor-wait" : "hover:bg-gray-50"}`}
    >
      <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-gray-300"}`} aria-hidden="true">
        {locked && !on ? <Lock className="w-[15px] h-[15px] text-gray-400" /> : on ? <Check className="w-[15px] h-[15px]" strokeWidth={3} /> : null}
      </span>
      {t("dashboard.sources.usedInThis")}
    </button>
  );
}
