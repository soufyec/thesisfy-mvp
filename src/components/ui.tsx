"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function Modal({ open, onClose, title, children, size = "md", footer }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; footer?: React.ReactNode }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white w-full ${w} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-base">{title}</h2>
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
  const color = value >= 90 ? "#22c55e" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${(value / 100) * c} ${c}`} strokeLinecap="round" />
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
