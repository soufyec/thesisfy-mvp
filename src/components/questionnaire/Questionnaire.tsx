"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useQuestionnaireT as useT, useQuestionnaireLanguage, QuestionnaireLanguageSelector } from "./Language";
import {
  Answers,
  canRemoveQuestion,
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
  const lang = useQuestionnaireLanguage();
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
  const [editorSectionId, setEditorSectionId] = useState(initial.sections[0].id);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [undoRemoval, setUndoRemoval] = useState<string>();
  const dragging = useRef<string>();
  const [dragKey, setDragKey] = useState<string>();
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // Draft: restore once, then keep in sync. Removed on submit.
  useEffect(() => {
    if (hydrated.current) return;
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

  const displayAnswers = team && editing ? previewAnswers : answers;
  const mode = modeOf(displayAnswers);
  const current = q.sections.find((s) => s.id === (team && editing ? editorSectionId : stack[stack.length - 1])) || q.sections[0];
  const items = team && editing ? current.items : visibleItems(current, mode);
  const editorIndex = q.sections.findIndex(s => s.id === current.id);
  const isFirst = team && editing ? editorIndex === 0 : stack.length === 1;
  const nextId = nextSectionId(q, current, answers, mode);
  const total = team && editing ? q.sections.length : stack.length + remainingAfter(q, current.id, answers, mode);
  const progress = team && editing ? editorIndex + 1 : stack.length;

  const setValue = (key: string, value: AnswerValue | undefined) => {
    (team && editing ? setPreviewAnswers : setAnswers)((a) => {
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
    if (team && editing) { const next = q.sections[editorIndex + 1]; if (next) { setEditorSectionId(next.id); scrollTop(); } return; }
    if (!validate()) return;
    if (nextId === SUBMIT) {
      await submit();
      return;
    }
    setStack((s) => [...s, nextId]);
    scrollTop();
  };

  const goBack = () => {
    if (team && editing) { const previous = q.sections[editorIndex - 1]; if (previous) { setEditorSectionId(previous.id); scrollTop(); } return; }
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
    if (team && editing) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, path: stack, durationSeconds: Math.round((Date.now() - startedAt) / 1000), language: lang.language, website: "" }),
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
      if (!res.ok) throw new Error();
      setQ((await res.json()).questionnaire);
    } catch { setEditError(t("q.team.saveError")); }
  };

  const removeEdit = async (id: string) => {
    if (!confirm(t("q.team.removeConfirm"))) return;
    try { const res = await fetch(`/api/questionnaire/edits/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error(); await reload(); }
    catch { setEditError(t("q.team.saveError")); }
  };

  const changeDefinition = async (body: Record<string, unknown>) => {
    setEditBusy(true); setEditError("");
    try {
      const res = await fetch("/api/questionnaire/edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: current.id, ...body }) });
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (body.kind === "remove") setUndoRemoval(result.edit.id);
      await reload();
    } catch { setEditError(t("q.team.saveError")); }
    finally { setEditBusy(false); }
  };
  const moveQuestion = (key: string, target: string) => {
    const keys = current.items.map(i => keyOf(current, i));
    const from = keys.indexOf(key), to = keys.indexOf(target);
    if (from < 0 || to < 0 || from === to || editBusy) return;
    keys.splice(from, 1); keys.splice(to, 0, key);
    void changeDefinition({ kind: "order", keys });
  };
  const undoDelete = async () => {
    if (!undoRemoval) return; setEditBusy(true);
    try { const res = await fetch(`/api/questionnaire/edits/${undoRemoval}`, { method: "DELETE" }); if (!res.ok) throw new Error(); setUndoRemoval(undefined); await reload(); }
    catch { setEditError(t("q.team.saveError")); } finally { setEditBusy(false); }
  };

  const minutes = mode === "entretien" ? 30 : 10;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-[720px] px-4 sm:px-6 min-h-14 py-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-gray-500 truncate">{t("q.subtitle")}</p>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[12px]">
            <QuestionnaireLanguageSelector />
            {mode === "entretien" && <span className="rounded-full bg-amber-50 text-amber-800 px-2.5 py-1 font-medium">{t("q.mode.entretien")}</span>}
            {team ? (
              <>
                <Link href="/equipe/resultats" className="text-gray-600 hover:text-gray-900 font-medium px-2 py-1">
                  {t("q.team.results")}
                </Link>
                <button
                  type="button"
                  onClick={() => { setEditorSectionId(current.id); setEditing((v) => !v); setErrors(new Set()); setSubmitError(""); }}
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
            <p className="mt-3 text-[15px] text-gray-600 leading-relaxed">{lang.text(q.confirmation).replace(/\s*!\s*/g, ". ")}</p>
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
                <h1 className="text-[20px] sm:text-[24px] font-bold tracking-[-0.02em] leading-tight">{lang.text(q.title)}</h1>
                <span className="text-[12px] text-gray-500 whitespace-nowrap">{t("q.progress", { n: progress, total })}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={progress} aria-label={t("q.progress", { n: progress, total })}>
                <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((progress / Math.max(total, 1)) * 100))}%` }} />
              </div>
            </div>

            {restored && !editing && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-[13px] text-brand-900">
                <span>{t("q.draftRestored")}</span>
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={reset}>
                  {t("q.draftClear")}
                </button>
              </div>
            )}

            {team && editing && <div className="mb-4 space-y-3 rounded-xl bg-brand-50 p-4">
              <p className="text-[13px] text-brand-900">{t("q.team.editHelp")}</p>
              <label className="block text-[13px] font-medium">{t("q.team.stage")}
                <select aria-label={t("q.team.stage")} className="input-field mt-1" value={current.id} onChange={e => { setEditorSectionId(e.target.value); setErrors(new Set()); }}>
                  {q.sections.map((s, index) => <option key={s.id} value={s.id}>{index + 1}. {lang.text(s.title) || t("q.team.start")}</option>)}
                </select>
              </label>
              {undoRemoval && <button className="inline-flex items-center gap-1 text-sm text-brand-800 underline" disabled={editBusy} onClick={undoDelete}><Undo2 className="w-4 h-4" />{t("q.team.undoRemove")}</button>}
            </div>}
            {editError && <p role="alert" className="mb-4 text-sm text-red-600">{editError}</p>}

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-8" aria-labelledby={current.title ? "section-title" : undefined}>
              {isFirst && (
                <div className="mb-6 text-[14px] text-gray-600 leading-relaxed">
                  {paragraphsFor(q.description, mode).map((p) => (
                    <p key={p} className="mb-2 last:mb-0">
                      {lang.text(p)}
                    </p>
                  ))}
                  <p className="mt-2 text-[12px] text-gray-400">{t("q.duration", { min: minutes })}</p>
                </div>
              )}
              {current.title && (
                <h2 id="section-title" className="text-[17px] font-bold mb-2">
                  {lang.text(current.title)}
                </h2>
              )}
              {paragraphsFor(current.description, mode).map((p) => (
                <p key={p} className={`text-[14px] leading-relaxed mb-3 ${/^Entretien/.test(p) ? "text-amber-900 bg-amber-50 rounded-xl px-3 py-2" : "text-gray-600"}`}>
                  {lang.text(p)}
                </p>
              ))}

              <div className="mt-5 flex flex-col gap-7">
                {items.map((item) => {
                  const key = keyOf(current, item);
                  return (
                    <div key={key} data-edit-key={key} className={dragKey === key ? "opacity-50" : ""}
                      onDragOver={event => { if (team && editing && dragging.current) event.preventDefault(); }}
                      onDrop={event => { if (!team || !editing || !dragging.current) return; event.preventDefault(); event.stopPropagation(); moveQuestion(dragging.current, key); dragging.current = undefined; setDragKey(undefined); }}>
                      {team && editing && <div className="mb-2 flex flex-wrap items-center gap-1">
                        <button type="button" draggable={!editBusy} disabled={editBusy} aria-label={t("q.team.drag")} className="p-2 text-gray-500 cursor-grab touch-none" onDragStart={event => { dragging.current = key; setDragKey(key); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key); }} onDragEnd={() => { dragging.current = undefined; setDragKey(undefined); }}><GripVertical className="w-4 h-4" /></button>
                        <button type="button" disabled={editBusy || current.items.indexOf(item) === 0} aria-label={t("q.team.moveUp")} className="p-2 text-gray-500 disabled:opacity-30" onClick={() => moveQuestion(key, keyOf(current, current.items[current.items.indexOf(item) - 1]))}><ArrowUp className="w-4 h-4" /></button>
                        <button type="button" disabled={editBusy || current.items.indexOf(item) === current.items.length - 1} aria-label={t("q.team.moveDown")} className="p-2 text-gray-500 disabled:opacity-30" onClick={() => moveQuestion(key, keyOf(current, current.items[current.items.indexOf(item) + 1]))}><ArrowDown className="w-4 h-4" /></button>
                        <button type="button" disabled={editBusy} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-brand-700" onClick={() => setAddRequest({ kind: "update", sectionId: current.id, targetKey: key, item: { ...item, title: lang.title(item), help: lang.help(item) }, locale: lang.language })}><Pencil className="w-3.5 h-3.5" />{t("q.team.editQuestion")}</button>
                        <button type="button" disabled={editBusy || !canRemoveQuestion(item)} title={!canRemoveQuestion(item) ? t("q.team.protected") : undefined} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 disabled:opacity-30" onClick={() => { if (confirm(t("q.team.deleteConfirm"))) void changeDefinition({ kind: "remove", targetKey: key }); }}><Trash2 className="w-3.5 h-3.5" />{t("q.team.remove")}</button>
                      </div>}
                      <QuestionField item={item} fieldKey={key} value={displayAnswers[key]} onChange={(v) => setValue(key, v)} mode={team && editing ? "entretien" : mode} error={errors.has(key)} editing={team && editing} onRemovePhrasing={removeEdit} />
                      {lang.needsTranslation(item) && <p className="mt-1 text-xs text-amber-700">{t("q.team.translationPending")}</p>}
                      {item.addedBy && <p className="mt-2 text-[11px] text-gray-400">{t("q.team.added")}</p>}
                      {team && editing && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-600 hover:border-brand-400 hover:text-brand-700" onClick={() => setAddRequest({ kind: "phrasing", sectionId: current.id, targetKey: key, questionTitle: item.title })}>
                            <Plus className="w-3.5 h-3.5" /> {t("q.team.addPhrasing")}
                          </button>
                          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-gray-600 hover:border-brand-400 hover:text-brand-700" onClick={() => setAddRequest({ kind: "item", sectionId: current.id, targetKey: key })}>
                            <Plus className="w-3.5 h-3.5" /> {t("q.team.addQuestionHere")}
                          </button>

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
                <button type="button" className="btn-primary !px-7" onClick={goNext} disabled={submitting || (team && editing && editorIndex === q.sections.length - 1)}>
                  {team && editing ? t("q.next") : nextId === SUBMIT ? (submitting ? t("q.sending") : t("q.send")) : t("q.next")}
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
