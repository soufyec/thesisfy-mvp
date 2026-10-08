"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Logo } from "@/components/landing/LandingNav";
import { Spinner } from "@/components/ui";
import { useFormat, useT } from "@/lib/i18n/client";
import { Indicator, indicators as computeIndicators, Item, itemsAlong, Mode, Profil, Questionnaire, ResponseRow } from "@/lib/questionnaire";

interface Payload {
  questionnaire: Questionnaire;
  responses: ResponseRow[];
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center text-[13px]">
      <span className="text-gray-700 leading-snug">{label}</span>
      <span className="text-gray-500 tabular-nums whitespace-nowrap">
        {n} · {pct}%
      </span>
      <div className="col-span-2 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Distribution({ item, values }: { item: Item; values: (string | number)[] }) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  const order: string[] = item.type === "scale" ? Array.from({ length: (item.max ?? 5) - (item.min ?? 1) + 1 }, (_, i) => String((item.min ?? 1) + i)) : [...(item.choices || [])];
  for (const k of Array.from(counts.keys())) if (!order.includes(k)) order.push(k);
  return (
    <div className="flex flex-col gap-2.5">
      {order.filter((k) => counts.get(k) || item.type === "scale" || (item.choices || []).includes(k)).map((k) => (
        <Bar key={k} label={k} n={counts.get(k) || 0} total={values.length} />
      ))}
    </div>
  );
}

/** Team page: counts, decision indicators, one block per question, free answers, CSV. */
export default function Results() {
  const t = useT();
  const f = useFormat();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [profil, setProfil] = useState<Profil | "all">("all");
  const [mode, setMode] = useState<Mode | "all">("all");

  useEffect(() => {
    fetch("/api/equipe/responses", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setData(await r.json());
      })
      .catch(() => setError(true));
  }, []);

  const rows = useMemo(() => (data ? data.responses.filter((r) => (profil === "all" || r.profil === profil) && (mode === "all" || r.mode === mode)) : []), [data, profil, mode]);
  const ind = useMemo(() => computeIndicators(rows), [rows]);
  const median = useMemo(() => {
    const d = rows.map((r) => r.durationSeconds).filter((n) => n > 0).sort((a, b) => a - b);
    return d.length ? Math.round(d[Math.floor(d.length / 2)] / 60) : null;
  }, [rows]);

  const pill = (active: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-medium border transition-colors ${active ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-brand-300"}`;

  const renderIndicator = (i: Indicator) => {
    const value = i.value === null ? "—" : i.kind === "mean" ? `${f.number(i.value, { maximumFractionDigits: 2 })} / ${i.max}` : `${f.number(i.value, { maximumFractionDigits: 1 })} %`;
    const status = i.target === undefined ? null : i.met === undefined ? t("q.results.pending") : i.met ? t("q.results.met") : t("q.results.notMet");
    const tone = i.met === undefined ? "text-gray-500 bg-gray-100" : i.met ? "text-green-700 bg-green-50" : "text-amber-700 bg-amber-50";
    return (
      <div key={i.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2">
        <p className="text-[13px] text-gray-600 leading-snug min-h-[2.5em]">{t(`q.ind.${i.id}`)}</p>
        <p className="text-[26px] font-bold tracking-[-0.02em] tabular-nums">{value}</p>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {i.target !== undefined && <span className="text-gray-500">{t("q.results.target", { target: i.kind === "mean" ? `≥ ${f.number(i.target)}` : `≥ ${i.target} %` })}</span>}
          <span className="text-gray-400">{t("q.results.n", { n: i.n })}</span>
          {status && <span className={`rounded-full px-2 py-0.5 font-medium ${tone}`}>{status}</span>}
        </div>
        {i.detail && i.id === "problem" && (
          <p className="text-[12px] text-gray-500">
            {t("q.ind.enseignants")} {f.number(i.detail.enseignants, { maximumFractionDigits: 2 })} · {t("q.ind.etudiants")} {f.number(i.detail.etudiants, { maximumFractionDigits: 2 })}
          </p>
        )}
        {i.detail && i.id === "pilot" && Object.keys(i.detail).length > 0 && (
          <div className="mt-1">
            <p className="text-[12px] font-medium text-gray-600 mb-1.5">{t("q.ind.deciders")}</p>
            <div className="flex flex-col gap-1.5">
              {Object.entries(i.detail)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <Bar key={k} label={k} n={n} total={i.n} />
                ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-[1040px] px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Logo />
          <nav className="flex items-center gap-1 text-[13px] font-medium">
            <Link href="/questionnaire" className="px-2.5 py-1.5 text-gray-600 hover:text-gray-900">
              {t("q.results.openForm")}
            </Link>
            <Link href="/questionnaire?mode=entretien" className="px-2.5 py-1.5 text-gray-600 hover:text-gray-900">
              {t("q.results.openInterview")}
            </Link>
            <button
              type="button"
              className="px-2.5 py-1.5 text-gray-400 hover:text-gray-700"
              onClick={async () => {
                await fetch("/api/equipe/login", { method: "DELETE" });
                window.location.href = "/equipe";
              }}
            >
              {t("q.team.logout")}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1040px] px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold tracking-[-0.02em]">{t("q.results.title")}</h1>
            {data && (
              <p className="mt-1 text-[13px] text-gray-500">
                {rows.length === 1 ? t("q.results.count_one") : t("q.results.count", { n: rows.length })}
                {rows.length > 0 && <> · {t("q.results.lastResponse", { date: f.dateTime(rows[0].createdAt) })}</>}
                {median !== null && <> · {t("q.results.medianDuration", { min: median })}</>}
              </p>
            )}
          </div>
          <a href="/api/equipe/responses?format=csv" className="btn-outline !py-2 !px-4 gap-2 text-[13px]">
            <Download className="w-4 h-4" /> {t("q.results.csv")}
          </a>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-gray-500 mr-1">{t("q.results.filter.profil")}</span>
            {(["all", "enseignant", "etudiant"] as const).map((p) => (
              <button key={p} type="button" className={pill(profil === p)} onClick={() => setProfil(p)} aria-pressed={profil === p}>
                {t(p === "all" ? "q.results.all" : `q.results.${p}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-gray-500 mr-1">{t("q.results.filter.mode")}</span>
            {(["all", "en_ligne", "entretien"] as const).map((m) => (
              <button key={m} type="button" className={pill(mode === m)} onClick={() => setMode(m)} aria-pressed={mode === m}>
                {t(m === "all" ? "q.results.all" : `q.results.${m}`)}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-[14px] text-red-600">{t("q.results.error")}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 text-[14px] text-gray-500">
            <Spinner /> {t("q.results.loading")}
          </p>
        )}

        {data && (
          <>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-3">{t("q.results.indicators")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-10">{ind.map(renderIndicator)}</div>

            {rows.length === 0 ? (
              <p className="text-[14px] text-gray-500">{t("q.results.noData")}</p>
            ) : (
              data.questionnaire.sections.map((section) => {
                const blocks = itemsAlong(data.questionnaire, [section.id]).filter(({ key }) => rows.some((r) => r.answers[key] !== undefined));
                if (!blocks.length) return null;
                return (
                  <section key={section.id} className="mb-10">
                    <h2 className="text-[17px] font-bold mb-4">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 block">{t("q.results.section")}</span>
                      {section.title || data.questionnaire.title}
                    </h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {blocks.map(({ item, key }) => {
                        const answered = rows.filter((r) => r.answers[key] !== undefined);
                        return (
                          <article key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 min-w-0">
                            <h3 className="text-[14px] font-semibold leading-snug mb-1">{item.title}</h3>
                            <p className="text-[12px] text-gray-400 mb-4">
                              {t("q.results.n", { n: answered.length })}
                              {item.addedBy && <> · {t("q.team.added")}</>}
                            </p>
                            {item.type === "scale" && (
                              <p className="text-[13px] text-gray-600 mb-3">
                                {t("q.results.mean")} <strong className="tabular-nums">{f.number(answered.reduce((a, r) => a + (r.answers[key] as number), 0) / answered.length, { maximumFractionDigits: 2 })}</strong> / {item.max ?? 5}
                              </p>
                            )}
                            {(item.type === "mc" || item.type === "scale") && <Distribution item={item} values={answered.map((r) => r.answers[key] as string | number)} />}
                            {item.type === "cb" && <Distribution item={item} values={answered.flatMap((r) => r.answers[key] as string[])} />}
                            {item.type === "grid" && (
                              <div className="flex flex-col gap-4">
                                {(item.rows || []).map((row) => {
                                  const vals = answered.map((r) => (r.answers[key] as Record<string, string>)[row]).filter(Boolean);
                                  return (
                                    <div key={row}>
                                      <p className="text-[13px] font-medium text-gray-700 mb-1.5">{row}</p>
                                      <Distribution item={{ ...item, type: "mc", choices: item.cols }} values={vals} />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {(item.type === "text" || item.type === "para") && (
                              <ul className="flex flex-col gap-2">
                                {answered.map((r) => (
                                  <li key={r.id} className="rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-800 whitespace-pre-wrap">
                                    {String(r.answers[key])}
                                    <span className="block mt-1 text-[11px] text-gray-400">
                                      {t(`q.results.${r.profil}`)} · {t(`q.results.${r.mode}`)}
                                      {r.interviewer && <> · {t("q.results.interviewer")} {r.interviewer}</>} · {f.date(r.createdAt)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </>
        )}
      </main>
    </div>
  );
}
