"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import {
  Answers,
  AnswerValue,
  ENTRETIEN_CHOICE,
  isAnswered,
  isValidValue,
  keyOf,
  Mode,
  MODE_ITEM,
  modeOf,
  nextSectionId,
  paragraphsFor,
  Profil,
  PROFIL_CHOICES,
  PROFIL_ITEM,
  Questionnaire as Definition,
  remainingAfter,
  Section,
  SUBMIT,
  visibleItems,
} from "@/lib/questionnaire";
import QuestionField from "./QuestionField";
import TeamEditor, { AddRequest } from "./TeamEditor";

const DRAFT_KEY = "questionnaire_draft_v1";

interface Draft {
  answers: Answers;
  stack: string[];
  startedAt: number;
}

interface Props {
  questionnaire: Definition;
  team: boolean;
  initialMode: Mode;
  presetProfil?: Profil;
}

/**
 * The validation questionnaire: one section per screen, conditional navigation from the JSON (`nav`, `next`),
 * a real history stack for « Retour », draft in localStorage, interviewer-only items in interview mode, and
 * (team cookie) inline editing: add questions and alternative phrasings.
 */
export default function Questionnaire({ questionnaire: initial, team, initialMode, presetProfil }: Props) {
  const t = useT();
  const [q, setQ] = useState<Definition>(initial);
  const baseAnswers = useMemo<Answers>(() => {
    const a: Answers = {};
    const modeItem = q.sections[0].items.find((i) => i.id === MODE_ITEM);
    if (modeItem?.choices) a[MODE_ITEM] = initialMode === "entretien" ? ENTRETIEN_CHOICE : modeItem.choices[0];
    if (presetProfil) a[PROFIL_ITEM] = presetProfil === "enseignant" ? PROFIL_CHOICES[0] : PROFIL_CHOICES[1];
    return a;
  }, [q, initialMode, presetProfil]);

  const [answers, setAnswers] = useState<Answers>(baseAnswers);
  const [stack, setStack] = useState<string[]>([q.sections[0].id]);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [restored, setRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // Draft: restore once, then keep in sync. Removed on submit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        const known = new Set(q.sections.map((s) => s.id));
        if (d && d.answers && Array.isArray(d.stack) && d.stack.length && d.stack.every((id) => known.has(id))) {
          const merged = { ...baseAnswers, ...d.answers };
          if (initialMode === "entretien") merged[MODE_ITEM] = ENTRETIEN_CHOICE;
          setAnswers(merged);
          setStack(d.stack);
          setStartedAt(d.startedAt || Date.now());
          if (d.stack.length > 1 || Object.keys(d.answers).length > Object.keys(baseAnswers).length) setRestored(true);
        }
      }
    } catch {}
    hydrated.current = true;
  }, [q, baseAnswers, initialMode]);

  useEffect(() => {
    if (!hydrated.current || submitted) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, stack, startedAt } satisfies Draft));
    } catch {}
  }, [answers, stack, startedAt, submitted]);

  const mode = modeOf(answers);
  const current = q.sections.find((s) => s.id === stack[stack.length - 1]) || q.sections[0];
  const items = visibleItems(current, mode);
  const isFirst = stack.length === 1;
  const nextId = nextSectionId(q, current, answers, mode);
  const total = stack.length + remainingAfter(q, current.id, answers, mode);

  const setValue = (key: string, value: AnswerValue | undefined) => {
    setAnswers((a) => {
      const n = { ...a };
      if (value === undefined) delete n[key];
      else n[key] = value;
      return n;
    });
    setErrors((e) => {
      if (!e.has(key)) return e;
      const n = new Set(e);
      n.delete(key);
      return n;
    });
  };

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const validate = (): boolean => {
    const bad = new Set<string>();
    for (const item of items) {
      const key = keyOf(current, item);
      const v = answers[key];
      const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) {
        if (item.req) bad.add(key);
        continue;
      }
      if (!isValidValue(item, v) || (item.req && !isAnswered(item, v))) bad.add(key);
    }
    setErrors(bad);
    if (bad.size) {
      const first = document.getElementById(`field-${Array.from(bad)[0]}`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  };

  const goNext = async () => {
    if (!validate()) return;
    if (nextId === SUBMIT) {
      await submit();
      return;
    }
    setStack((s) => [...s, nextId]);
    scrollTop();
  };

  const goBack = () => {
    if (isFirst) return;
    setErrors(new Set());
    setStack((s) => s.slice(0, -1));
    scrollTop();
  };

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setAnswers(baseAnswers);
    setStack([q.sections[0].id]);
    setStartedAt(Date.now());
    setErrors(new Set());
    setRestored(false);
    setSubmitted(false);
    setSubmitError("");
    scrollTop();
  }, [baseAnswers, q]);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, path: stack, durationSeconds: Math.round((Date.now() - startedAt) / 1000), website: "" }),
      });
      if (res.status === 422) {
        setSubmitError(t("q.submitInvalid"));
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      setSubmitted(true);
      scrollTop();
    } catch {
      setSubmitError(t("q.submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const reload = async () => {
    try {
      const res = await fetch("/api/questionnaire", { cache: "no-store" });
      if (res.ok) setQ((await res.json()).questionnaire);
    } catch {}
  };

  const removeEdit = async (id: string) => {
    if (!confirm(t("q.team.removeConfirm"))) return;
    await fetch(`/api/questionnaire/edits/${id}`, { method: "DELETE" });
    await reload();
  };

  const minutes = mode === "entretien" ? 30 : 10;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-[720px] px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <p className="text-[13px] text-gray-500 truncate">{t("q.subtitle")}</p>
          <div className="flex items-center gap-2 text-[12px] flex-shrink-0">
            {mode === "entretien" && <span className="rounded-full bg-amber-50 text-amber-800 px-2.5 py-1 font-medium">{t("q.mode.entretien")}</span>}
            {team ? (
              <>
                <Link href="/equipe/resultats" className="text-gray-600 hover:text-gray-900 font-medium px-2 py-1">
                  {t("q.team.results")}
                </Link>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  aria-pressed={editing}
                  className={`rounded-full px-3 py-1 font-medium border transition-colors ${editing ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 text-gray-700 hover:border-brand-300"}`}
                >
                  {t("q.team.edit")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main ref={topRef} className="mx-auto max-w-[720px] px-4 sm:px-6 py-6 sm:py-10 scroll-mt-4">
        {submitted ? (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-10 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500/15 text-accent-500" aria-hidden="true">
              <Check className="w-6 h-6" strokeWidth={2.5} />
            </span>
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">{t("q.done.title")}</h1>
            <p className="mt-3 text-[15px] text-gray-600 leading-relaxed">{q.confirmation.replace(/\s*!\s*/g, ". ")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {mode === "entretien" && (
                <button type="button" className="btn-primary" onClick={reset}>
                  {t("q.done.again")}
                </button>
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="mb-5">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h1 className="text-[20px] sm:text-[24px] font-bold tracking-[-0.02em] leading-tight">{q.title}</h1>
                <span className="text-[12px] text-gray-500 whitespace-nowrap">{t("q.progress", { n: stack.length, total })}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={stack.length} aria-label={t("q.progress", { n: stack.length, total })}>
                <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((stack.length / Math.max(total, 1)) * 100))}%` }} />
              </div>
            </div>

            {restored && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-[13px] text-brand-900">
                <span>{t("q.draftRestored")}</span>
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={reset}>
                  {t("q.draftClear")}
                </button>
              </div>
            )}

            {team && editing && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{t("q.team.editHelp")}</p>}

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-8" aria-labelledby={current.title ? "section-title" : undefined}>
              {isFirst && (
                <div className="mb-6 text-[14px] text-gray-600 leading-relaxed">
                  {paragraphsFor(q.description, mode).map((p) => (
                    <p key={p} className="mb-2 last:mb-0">
                      {p}
                    </p>
                  ))}
                  <p className="mt-2 text-[12px] text-gray-400">{t("q.duration", { min: minutes })}</p>
                </div>
              )}
              {current.title && (
                <h2 id="section-title" className="text-[17px] font-bold mb-2">
                  {current.title}
                </h2>
              )}
              {paragraphsFor(current.description, mode).map((p) => (
                <p key={p} className={`text-[14px] leading-relaxed mb-3 ${/^Entretien/.test(p) ? "text-amber-900 bg-amber-50 rounded-xl px-3 py-2" : "text-gray-600"}`}>
                  {p}
                </p>
              ))}

              <div className="mt-5 flex flex-col gap-7">
                {items.map((item) => {
                  const key = keyOf(current, item);
                  return (
                    <div key={key}>
                      <QuestionField item={item} fieldKey={key} value={answers[key]} onChange={(v) => setValue(key, v)} mode={mode} error={errors.has(key)} editing={team && editing} onRemovePhrasing={removeEdit} />
                      {item.addedBy && <p className="mt-2 text-[11px] text-gray-400">{t("q.team.added")}</p>}
                      {team && editing && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-600 hover:border-brand-400 hover:text-brand-700" onClick={() => setAddRequest({ kind: "phrasing", sectionId: current.id, targetKey: key, questionTitle: item.title })}>
                            <Plus className="w-3.5 h-3.5" /> {t("q.team.addPhrasing")}
                          </button>
                          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-600 hover:border-brand-400 hover:text-brand-700" onClick={() => setAddRequest({ kind: "item", sectionId: current.id, targetKey: key })}>
                            <Plus className="w-3.5 h-3.5" /> {t("q.team.addQuestionHere")}
                          </button>
                          {item.addedBy && (
                            <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-600 hover:border-red-400 hover:text-red-600" onClick={() => removeEdit(item.addedBy!)}>
                              <Trash2 className="w-3.5 h-3.5" /> {t("q.team.remove")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {team && editing && (
                  <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-[13px] font-medium text-brand-700 hover:bg-brand-50" onClick={() => setAddRequest({ kind: "item", sectionId: current.id })}>
                    <Plus className="w-4 h-4" /> {t("q.team.addQuestion")}
                  </button>
                )}
              </div>

              {errors.size > 0 && (
                <p className="mt-6 text-[13px] text-red-600" role="alert">
                  {t("q.missing")}
                </p>
              )}
              {submitError && (
                <p className="mt-6 text-[13px] text-red-600" role="alert">
                  {submitError}
                </p>
              )}

              <div className="mt-8 flex items-center justify-between gap-3">
                <button type="button" className="btn-outline !px-5" onClick={goBack} disabled={isFirst} aria-disabled={isFirst}>
                  {t("q.back")}
                </button>
                <button type="button" className="btn-primary !px-7" onClick={goNext} disabled={submitting}>
                  {nextId === SUBMIT ? (submitting ? t("q.sending") : t("q.send")) : t("q.next")}
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {team && <TeamEditor request={addRequest} onClose={() => setAddRequest(null)} onSaved={reload} />}
    </div>
  );
}
