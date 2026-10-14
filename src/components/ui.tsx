"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Briefcase, CalendarClock, CircleCheck, FileBarChart, FileText, FlaskConical, GraduationCap, LibraryBig, Lightbulb, ListChecks, Newspaper, NotebookPen, PenLine, X, type LucideIcon } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n/client";
import { deadlineState, fromDateInput, toDateInput, type DeadlineState, type DeadlineTone } from "@/lib/deadline";
import type { PaperKind } from "@/lib/papers/kinds";
import { templateFor } from "@/lib/papers/templates";
import type { PaperStatus } from "@/lib/papers/views";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);

/**
 * Dialog shell. Keyboard (CLAUDE.md §7): focus moves into the dialog when it opens (a field with autoFocus keeps it,
 * otherwise the first control, the close button), Tab stays inside the topmost dialog, Escape closes, and on close focus
 * returns to the control that opened it, unless something else (the editor, another dialog) has taken it meanwhile.
 */
export function Modal({ open, onClose, title, children, size = "md", footer }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; footer?: React.ReactNode }) {
  const t = useT();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    if (panel && !panel.contains(document.activeElement)) (focusables(panel)[0] || panel).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCloseRef.current();
      if (e.key !== "Tab" || !root || !panel) return;
      // Only the topmost dialog keeps Tab inside itself.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== root) return;
      const items = focusables(panel);
      const active = document.activeElement;
      if (!items.length) {
        e.preventDefault();
        panel.focus();
      } else if (e.shiftKey && (active === items[0] || !panel.contains(active))) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (active === items[items.length - 1] || !panel.contains(active))) {
        e.preventDefault();
        items[0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const active = document.activeElement;
      const focusWasHere = !active || active === document.body || (!!panel && panel.contains(active));
      if (opener && opener.isConnected && focusWasHere) opener.focus();
    };
  }, [open]);
  if (!open) return null;
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={`relative bg-white w-full ${w} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up focus:outline-none`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 id={titleId} className="font-semibold text-base">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label={t("common.close")}>
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <span className={`inline-block ${className} border-2 border-current border-t-transparent rounded-full animate-spin`} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <div className="font-medium text-gray-700">{title}</div>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toast({ message, kind = "info", onClose }: { message: string; kind?: "info" | "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  const color = kind === "success" ? "bg-green-600" : kind === "error" ? "bg-red-600" : "bg-gray-900";
  return <div className={`fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[110] ${color} text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in max-w-[90vw]`}>{message}</div>;
}

export function ScoreRing({ value, size = 56, stroke = 4 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 90 ? "stroke-green-500" : value >= 70 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-gray-200" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={color} strokeWidth={stroke} strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{value}%</div>
    </div>
  );
}

/**
 * Integrity pill: a conic ring with the provenance split (AI · pasted · written) and the score.
 * `variant="landing"` is the softer brand-tinted version used in the hero preview.
 */
export function IntegrityPill({ aiPct, pastePct, limitPct, score, onClick, variant = "header", className = "" }: { aiPct: number; pastePct: number; limitPct: number; score: number; onClick?: () => void; variant?: "header" | "landing"; className?: string }) {
  const t = useT();
  const a = Math.max(0, Math.min(100, aiPct));
  const p = Math.max(0, Math.min(100 - a, pastePct));
  const ring = `conic-gradient(var(--prov-ai) 0 ${a}%, var(--prov-paste) ${a}% ${a + p}%, var(--prov-human) ${a + p}% 100%)`;
  const scoreColor = score >= 90 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const Tag = onClick ? "button" : "span";
  if (variant === "landing") {
    return (
      <span className={`inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 text-[12px] font-semibold px-3 py-1.5 ${className}`}>
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: ring }} aria-hidden="true" />
        {t("ui.integrityPill.landing", { ai: a, limit: limitPct, score })}
      </span>
    );
  }
  return (
    <Tag onClick={onClick} className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white text-[13px] font-semibold text-gray-900 pl-2 pr-3 py-1.5 ${onClick ? "hover:bg-gray-50" : ""} ${className}`} aria-label={t("ui.integrityPill.aria", { ai: a, limit: limitPct, score })} title={t("ui.integrityPill.title")}>
      <span className="relative w-[18px] h-[18px] rounded-full flex-shrink-0" style={{ background: ring }} aria-hidden="true">
        <span className="absolute inset-1 rounded-full bg-white" />
      </span>
      <span>{t("ui.integrityPill.aiShare", { ai: a })} <span className="text-gray-400 font-normal">{t("ui.integrityPill.ofLimit", { limit: limitPct })}</span> · {t("glossary.integrity")} <span className={scoreColor}>{score}</span></span>
    </Tag>
  );
}

/** Tone classes shared by every deadline chip: neutral far away, amber within a month, red within a week or past. */
export const DEADLINE_TONE: Record<DeadlineTone, string> = {
  ok: "bg-gray-100 text-gray-700",
  soon: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
  overdue: "bg-red-600 text-white",
};

export const DEADLINE_TEXT: Record<DeadlineTone, string> = { ok: "text-gray-900", soon: "text-amber-600", urgent: "text-red-600", overdue: "text-red-600" };

/** "42 days left", "Due today", "3 days overdue": the one phrase every surface uses for a deadline. */
export function useDeadlineLabel() {
  const t = useT();
  return (d: DeadlineState) => {
    if (d.daysLeft === 0) return t("deadline.today");
    if (d.daysLeft === 1) return t("deadline.tomorrow");
    if (d.daysLeft === -1) return t("deadline.overdue_one");
    if (d.daysLeft < 0) return t("deadline.overdue", { n: -d.daysLeft });
    return t("deadline.daysLeft", { n: d.daysLeft });
  };
}

/** Statuses in which a paper counts as handed in (the deadline chip then says "Submitted" instead of counting down). */
const SUBMITTED_STATUSES: ReadonlyArray<PaperStatus | "not_started"> = ["under_review", "approved", "submitted"];

/** Late = handed in after the stored deadline (docs/papers.md §3.1: `submittedAt > deadline`), the same rule as the server. */
export function isSubmittedLate(submittedAt?: string, deadline?: string): boolean {
  if (!submittedAt || !deadline) return false;
  const s = Date.parse(submittedAt);
  const d = Date.parse(deadline);
  return !Number.isNaN(s) && !Number.isNaN(d) && s > d;
}

/**
 * Deadline chip: the days left (coloured by urgency) with the date as a tooltip. Without a deadline it offers to add one
 * when `onClick` is given, so the student can set it from wherever they are. The same chip is shown to the advisor.
 * Once the paper is handed in it says "Submitted" or "Submitted late" (amber) instead: pass `status` (a handed-in status
 * shows the submitted chip, any other status the countdown, even if an older `submittedAt` exists) or only `submittedAt`.
 * `late` overrides the client-side comparison with the server's value when the caller has it.
 */
export function DeadlineChip({ deadline, wordCount = 0, targetWords = 0, onClick, className = "", withDate = false, submittedAt, status, late }: { deadline?: string; wordCount?: number; targetWords?: number; onClick?: () => void; className?: string; withDate?: boolean; submittedAt?: string; status?: PaperStatus | "not_started"; late?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const label = useDeadlineLabel();
  const base = `inline-flex items-center gap-1 rounded-[10px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`;
  const handedIn = status ? SUBMITTED_STATUSES.includes(status) : !!submittedAt;
  if (handedIn) {
    const isLate = late ?? isSubmittedLate(submittedAt, deadline);
    const title = [submittedAt ? t("deadline.submittedOn", { date: fmt.date(submittedAt) }) : "", deadline ? t("deadline.due", { date: fmt.date(deadline) }) : ""].filter(Boolean).join(" · ");
    return (
      <span className={`${base} ${isLate ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`} title={title || undefined}>
        <CircleCheck className="w-3.5 h-3.5" aria-hidden="true" />
        {t(isLate ? "deadline.submittedLate" : "deadline.submitted")}
      </span>
    );
  }
  const d = deadlineState(deadline, wordCount, targetWords);
  if (!d) {
    if (!onClick) return null;
    return (
      <button type="button" onClick={onClick} className={`${base} bg-white border border-dashed border-gray-300 text-gray-500 hover:text-brand-600 hover:border-brand-300`}>
        <CalendarClock className="w-3.5 h-3.5" />{t("deadline.add")}
      </button>
    );
  }
  const text = withDate ? `${label(d)} · ${fmt.date(deadline as string)}` : label(d);
  const title = t("deadline.due", { date: fmt.date(deadline as string) });
  if (!onClick) return <span className={`${base} ${DEADLINE_TONE[d.tone]}`} title={title}><CalendarClock className="w-3.5 h-3.5" />{text}</span>;
  return (
    <button type="button" onClick={onClick} className={`${base} ${DEADLINE_TONE[d.tone]} hover:ring-2 hover:ring-brand-100`} title={title} aria-label={`${t("deadline.title")}: ${text}`}>
      <CalendarClock className="w-3.5 h-3.5" />{text}
    </button>
  );
}

/** lucide components named by `PaperTemplate.icon` (docs/papers.md §2). */
const KIND_ICONS: Record<string, LucideIcon> = { GraduationCap, BookOpen, PenLine, NotebookPen, FileBarChart, FlaskConical, Briefcase, LibraryBig, Lightbulb, Newspaper, ListChecks, FileText };

/** Icon of a paper kind (decorative: the kind name is always shown or read next to it). */
export function KindIcon({ kind, size = 16, className = "" }: { kind: PaperKind; size?: number; className?: string }) {
  const Icon = KIND_ICONS[templateFor(kind).icon] ?? FileText;
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}

/** Square tile with the kind icon: 32px (`md`) or 24px (`sm`), brand-50 on brand-700. */
export function KindTile({ kind, size = "md", className = "" }: { kind: PaperKind; size?: "sm" | "md"; className?: string }) {
  const box = size === "sm" ? "w-6 h-6 rounded-md" : "w-8 h-8 rounded-lg";
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 bg-brand-50 text-brand-700 ${box} ${className}`} aria-hidden="true">
      <KindIcon kind={kind} size={size === "sm" ? 14 : 16} />
    </span>
  );
}

/** Small chip with the kind icon and its translated name ("Essay", «Mémoire»…). */
export function KindChip({ kind, className = "" }: { kind: PaperKind; className?: string }) {
  const t = useT();
  return (
    <span className={`inline-flex items-center gap-1 max-w-full min-w-0 rounded-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 text-[11px] font-medium ${className}`}>
      <KindIcon kind={kind} size={14} className="flex-shrink-0" />
      <span className="truncate">{t(`papers.kind.${kind}`)}</span>
    </span>
  );
}

/** Pick, change or remove a thesis deadline. `onSave` receives the stored ISO value, or undefined to clear it. */
export function DeadlineDialog({ open, onClose, deadline, onSave }: { open: boolean; onClose: () => void; deadline?: string; onSave: (iso: string | undefined) => void | Promise<void> }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setValue(toDateInput(deadline));
  }, [open, deadline]);
  const save = async (iso: string | undefined) => {
    setSaving(true);
    try {
      await onSave(iso);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  const p = (n: number) => String(n).padStart(2, "0");
  const today = new Date();
  const min = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("deadline.title")}
      size="sm"
      footer={
        <>
          {deadline && <button type="button" onClick={() => save(undefined)} disabled={saving} className="btn-outline !py-2 !px-4 text-sm text-red-600 mr-auto">{t("deadline.remove")}</button>}
          <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button>
          <button type="button" onClick={() => save(fromDateInput(value))} disabled={saving || !fromDateInput(value)} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{t("common.save")}</button>
        </>
      }
    >
      <label className="block text-xs text-gray-500">
        {t("deadline.dialogDate")}
        <input type="date" value={value} min={min} onChange={(e) => setValue(e.target.value)} className="input-field !py-2 mt-1" autoFocus />
      </label>
      <p className="text-xs text-gray-500 mt-3">{t("deadline.dialogHelp")}</p>
    </Modal>
  );
}
