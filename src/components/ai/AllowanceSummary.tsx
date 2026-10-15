"use client";

import { useFormat, useT } from "@/lib/i18n/client";

export interface StudentAllowance {
  institutionPays: boolean;
  exhausted: string;
  usage?: {
    requests: number;
    tokensUsed?: number;
    remainingTokens?: number | null;
    remainingRequests: number | null;
    usedPercent: number | null;
    institutionPercent: number | null;
    resetsAt: string;
    runsOutAt: string | null;
  };
}

/** Student-facing usage: real counts and explicitly estimated capacity, without billing amounts. */
export default function AllowanceSummary({ allowance }: { allowance: StudentAllowance }) {
  const t = useT();
  const fmt = useFormat();
  const usage = allowance.usage;
  if (!usage) return null;
  const exhausted = allowance.exhausted !== "none";
  const percent = Math.max(0, Math.min(100, usage.usedPercent ?? usage.institutionPercent ?? 0));
  const headline = exhausted
    ? t("assistant.allowance.remainingNone")
    : usage.remainingRequests === null
      ? t("assistant.allowance.unlimited")
      : t("assistant.allowance.remaining", { n: fmt.number(usage.remainingRequests) });
  return (
    <div className="text-xs text-gray-600 space-y-1.5" aria-live="polite">
      <p className={`font-medium ${exhausted ? "text-red-600" : "text-gray-900"}`}>{headline}</p>
      <p>{t("assistant.allowance.activity", { requests: fmt.number(usage.requests), tokens: fmt.number(usage.tokensUsed ?? 0) })}</p>
      {!exhausted && usage.remainingTokens != null && <p>{t("assistant.allowance.tokensLeft", { n: fmt.number(usage.remainingTokens) })}</p>}
      {(usage.usedPercent !== null || usage.institutionPercent !== null) && (
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-label={t("assistant.allowance.used", { percent: fmt.number(percent) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className={`h-full rounded-full ${exhausted ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="text-gray-500">{!exhausted && usage.runsOutAt
        ? t("assistant.allowance.paceUntil", { date: fmt.date(usage.runsOutAt, { day: "numeric", month: "short" }) })
        : t("assistant.allowance.resetShort", { date: fmt.date(usage.resetsAt, { day: "numeric", month: "short" }) })}</p>
    </div>
  );
}
