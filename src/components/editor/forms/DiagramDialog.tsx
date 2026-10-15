"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useFormat, useT } from "@/lib/i18n/client";
import { LOCALE_NAMES } from "@/lib/i18n";
import { translate } from "@/lib/i18n/dictionary";
import {
  CONCEPT_EDGE_LABEL_MAX,
  CONCEPT_LABEL_MAX,
  CONCEPT_MAX_EDGES,
  CONCEPT_MAX_NODES,
  GANTT_GROUP_MAX,
  GANTT_LABEL_MAX,
  GANTT_MAX_TASKS,
  PRISMA_IDENTIFICATION_KEYS,
  PRISMA_INCLUDED_KEYS,
  PRISMA_LABEL_KEYS,
  PRISMA_MAX_REASONS,
  PRISMA_OTHER_KEYS,
  PRISMA_REASON_MAX,
  PRISMA_SCREENING_KEYS,
  diagramErrorText,
  diagramWarningText,
  renderDiagramSvg,
  sanitizeDiagram,
  type DiagramFigure,
  type DiagramSpec,
  type DiagramWarning,
  type PrismaCountKey,
} from "@/lib/diagrams";
import type { WritingLanguage } from "../types";

export interface DiagramDialogValue {
  /** The spec after `sanitizeDiagram` (what the chart node stores). */
  spec: DiagramSpec;
  caption: string;
  /** Non-blocking notices (PRISMA arithmetic, shortened labels), as shown in the form. */
  warnings: DiagramWarning[];
}

export interface DiagramDialogProps {
  open: boolean;
  onClose: () => void;
  kind: DiagramFigure;
  /** Writing language of the paper: the preview is drawn in it (PRISMA boxes, month names). The form follows the UI. */
  lang: WritingLanguage;
  /** Editing: the current spec, caption and origin (an AI diagram stays AI-assisted after the edit, D22). */
  initial?: { spec?: DiagramSpec | null; caption?: string | null; origin?: "ai" | "human" };
  /** Called only with a spec that passed `sanitizeDiagram`. */
  onSubmit: (value: DiagramDialogValue) => void;
}

type Unit = "auto" | "week" | "month";
interface TaskRow { key: number; label: string; start: string; end: string; group: string; milestone: boolean }
interface ReasonRow { key: number; label: string; n: string }
interface NodeRow { id: string; label: string }
interface EdgeRow { key: number; from: string; to: string; label: string }

interface FormState {
  unit: Unit;
  tasks: TaskRow[];
  counts: Partial<Record<PrismaCountKey, string>>;
  reasons: ReasonRow[];
  otherMethods: boolean;
  nodes: NodeRow[];
  edges: EdgeRow[];
}

let seq = 0;
const nextKey = () => ++seq;
const emptyTask = (): TaskRow => ({ key: nextKey(), label: "", start: "", end: "", group: "", milestone: false });

function initialState(kind: DiagramFigure, spec?: DiagramSpec | null): FormState {
  const s: FormState = { unit: "auto", tasks: [emptyTask(), emptyTask()], counts: {}, reasons: [], otherMethods: false, nodes: [], edges: [] };
  if (kind === "gantt" && spec && spec.figure === "gantt") {
    s.unit = spec.unit;
    s.tasks = spec.tasks.map((x) => ({ key: nextKey(), label: x.label, start: x.start, end: x.milestone ? "" : x.end, group: x.group || "", milestone: !!x.milestone }));
  }
  if (kind === "prisma" && spec && spec.figure === "prisma") {
    for (const k of Object.keys(spec.counts)) s.counts[k as PrismaCountKey] = String(spec.counts[k]);
    s.reasons = (spec.reasons || []).map((r) => ({ key: nextKey(), label: r.label, n: String(r.n) }));
    s.otherMethods = !!spec.otherMethods;
  }
  if (kind === "conceptMap") {
    if (spec && spec.figure === "conceptMap") {
      s.nodes = spec.nodes.map((n) => ({ id: n.id, label: n.label }));
      s.edges = spec.edges.map((e) => ({ key: nextKey(), from: e.from, to: e.to, label: e.label || "" }));
    } else {
      s.nodes = [{ id: newNodeId([]), label: "" }];
      s.nodes.push({ id: newNodeId(s.nodes), label: "" });
    }
  }
  return s;
}

function newNodeId(nodes: NodeRow[]): string {
  let i = nodes.length + 1;
  const used = new Set(nodes.map((n) => n.id));
  while (used.has(`c${i}`)) i++;
  return `c${i}`;
}

/** The candidate spec of the form and, per list, the form row each spec item came from (to point at the row in error). */
interface Candidate {
  input: unknown;
  rows: Record<"tasks" | "reasons" | "nodes" | "edges", number[]>;
  filled: boolean;
}

function buildCandidate(kind: DiagramFigure, s: FormState): Candidate {
  const rows: Candidate["rows"] = { tasks: [], reasons: [], nodes: [], edges: [] };
  if (kind === "gantt") {
    const tasks: Record<string, unknown>[] = [];
    s.tasks.forEach((r, i) => {
      if (!r.label.trim() && !r.start.trim() && !r.end.trim() && !r.group.trim()) return;
      rows.tasks.push(i);
      const task: Record<string, unknown> = { label: r.label, start: r.start.trim(), end: r.milestone ? "" : r.end.trim() };
      if (r.group.trim()) task.group = r.group;
      if (r.milestone) task.milestone = true;
      tasks.push(task);
    });
    return { input: { figure: "gantt", ...(s.unit === "auto" ? {} : { unit: s.unit }), tasks }, rows, filled: tasks.length > 0 };
  }
  if (kind === "prisma") {
    const counts: Record<string, string> = {};
    for (const k of Object.keys(s.counts) as PrismaCountKey[]) {
      const v = (s.counts[k] || "").trim();
      if (!v) continue;
      if (!s.otherMethods && (PRISMA_OTHER_KEYS as readonly string[]).indexOf(k) !== -1) continue;
      counts[k] = v;
    }
    const reasons: Record<string, unknown>[] = [];
    s.reasons.forEach((r, i) => {
      if (!r.label.trim() && !r.n.trim()) return;
      rows.reasons.push(i);
      reasons.push({ label: r.label, n: r.n.trim() === "" ? undefined : r.n.trim() });
    });
    const filled = Object.keys(counts).length > 0 || reasons.length > 0;
    return { input: { figure: "prisma", counts, reasons, otherMethods: s.otherMethods }, rows, filled };
  }
  const nodes: { id: string; label: string }[] = [];
  s.nodes.forEach((n, i) => {
    if (!n.label.trim()) return;
    rows.nodes.push(i);
    nodes.push({ id: n.id, label: n.label });
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Record<string, unknown>[] = [];
  s.edges.forEach((e, i) => {
    if (!e.from || !e.to || !ids.has(e.from) || !ids.has(e.to)) return;
    rows.edges.push(i);
    edges.push({ from: e.from, to: e.to, ...(e.label.trim() ? { label: e.label } : {}) });
  });
  return { input: { figure: "conceptMap", nodes, edges }, rows, filled: nodes.length > 0 };
}

/**
 * Insert › Diagram (Timeline (Gantt) · PRISMA flow · Concept map) and the edit form of a diagram figure (D22, D26).
 * Every change is checked with `sanitizeDiagram` and drawn live with `renderDiagramSvg` in the paper's writing
 * language, so the preview is exactly the figure that will be inserted. PRISMA arithmetic gives notices that never
 * block. The origin sentence above the buttons says how the figure is counted.
 */
export default function DiagramDialog({ open, onClose, kind, lang, initial, onSubmit }: DiagramDialogProps) {
  const t = useT();
  const fmt = useFormat();
  const [s, setS] = useState<FormState>(() => initialState(kind, initial?.spec));
  const [caption, setCaption] = useState(initial?.caption || "");
  const editing = !!initial?.spec;
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setS(initialState(kind, initial?.spec));
    setCaption(initial?.caption || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const candidate = useMemo(() => buildCandidate(kind, s), [kind, s]);
  const check = useMemo(() => sanitizeDiagram(candidate.input), [candidate]);
  const wTr = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  // The preview is drawn by the same renderer at the width of its box (360–640 px), so its text stays readable.
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(480);
  useEffect(() => {
    const el = previewRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth - 16);
      if (w > 0) setPreviewWidth(Math.max(360, Math.min(640, w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  // The preview redraws from a deferred copy of the form (a large concept map takes tens of ms to lay out), so typing
  // never waits for it; the caption is not part of the drawing (it is shown under the figure, not in the preview).
  const deferredCheck = useDeferredValue(check);
  const preview = useMemo(() => {
    if (!deferredCheck.ok) return null;
    try {
      const name = translate(lang, `figures.kind.${kind}`);
      return renderDiagramSvg(deferredCheck.spec, { width: previewWidth, lang, tr: wTr, title: name, desc: name });
    } catch {
      return null;
    }
  }, [deferredCheck, lang, wTr, kind, previewWidth]);

  // Where the error is: "tasks[2].start" → the form row and field.
  const errorAt = useMemo(() => {
    if (check.ok || !candidate.filled || !check.field) return null;
    const m = /^(tasks|reasons|nodes|edges)\[(\d+)\]\.?(\w+)?$/.exec(check.field);
    if (m) {
      const list = m[1] as keyof Candidate["rows"];
      const row = candidate.rows[list][Number(m[2])];
      return { list: list as string, row: row ?? -1, field: m[3] || "" };
    }
    const c = /^counts\.(\w+)$/.exec(check.field);
    if (c) return { list: "counts", row: -1, field: c[1] };
    return { list: check.field, row: -1, field: "" };
  }, [check, candidate]);

  const errorLabel = (() => {
    if (!errorAt) return "";
    if (errorAt.list === "tasks" && errorAt.row >= 0) return t("figures.gantt.taskN", { n: errorAt.row + 1 });
    if (errorAt.list === "nodes" && errorAt.row >= 0) return t("figures.concept.nodeN", { n: errorAt.row + 1 });
    if (errorAt.list === "edges" && errorAt.row >= 0) return `${t("figures.concept.links")} ${errorAt.row + 1}`;
    if (errorAt.list === "reasons" && errorAt.row >= 0) return `${t("figures.prisma.reason")} ${errorAt.row + 1}`;
    if (errorAt.list === "counts" && (PRISMA_LABEL_KEYS as Record<string, string>)[errorAt.field]) return t(PRISMA_LABEL_KEYS[errorAt.field as PrismaCountKey]);
    return "";
  })();
  const invalid = (list: string, row: number, field?: string) => !!errorAt && errorAt.list === list && errorAt.row === row && (!field || !errorAt.field || errorAt.field === field);

  const update = (patch: Partial<FormState>) => setS((prev) => ({ ...prev, ...patch }));
  const setTask = (i: number, patch: Partial<TaskRow>) => update({ tasks: s.tasks.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const moveTask = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= s.tasks.length) return;
    const next = s.tasks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ tasks: next });
  };

  const submit = () => {
    if (!check.ok) return;
    onSubmit({ spec: check.spec, caption: caption.replace(/\s+/g, " ").trim().slice(0, 200), warnings: check.warnings });
  };

  const titleKey = `figures.diagram.${editing ? "titleEdit" : "titleNew"}.${kind}`;
  const origin = initial?.origin === "ai" ? t("figures.diagram.keepsAi") : t("figures.diagram.counted");
  const input = "w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-[13px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500";
  const inputCls = (bad: boolean) => `${input} ${bad ? "border-red-600" : "border-gray-200"}`;
  const iconBtn = "inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40";
  const addBtn = "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40";
  const sectionTitle = "text-[13px] font-semibold text-gray-800";

  // ---------- Timeline ----------
  const gantt = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className={sectionTitle}>{t("figures.gantt.tasks")}</h3>
        <label className="flex items-center gap-2 text-[13px] text-gray-700">
          {t("figures.gantt.unit")}
          <select value={s.unit} onChange={(e) => update({ unit: e.target.value as Unit })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/20">
            <option value="auto">{t("figures.gantt.unitAuto")}</option>
            <option value="week">{t("figures.gantt.unitWeek")}</option>
            <option value="month">{t("figures.gantt.unitMonth")}</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-600">{t("figures.gantt.dates")}</p>
      <ol className="space-y-2">
        {s.tasks.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-gray-200 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="w-6 text-right text-xs text-gray-500 tabular-nums flex-shrink-0">{i + 1}</span>
              <input ref={i === 0 ? firstField : undefined} value={r.label} maxLength={GANTT_LABEL_MAX + 20} onChange={(e) => setTask(i, { label: e.target.value })} placeholder={t("figures.gantt.task")} aria-label={t("figures.gantt.taskN", { n: i + 1 })} aria-invalid={invalid("tasks", i, "label") || undefined} className={inputCls(invalid("tasks", i, "label"))} />
              <button type="button" className={iconBtn} onClick={() => moveTask(i, -1)} disabled={i === 0} aria-label={t("figures.gantt.moveUp", { n: i + 1 })} title={t("figures.gantt.moveUp", { n: i + 1 })}><ArrowUp size={15} /></button>
              <button type="button" className={iconBtn} onClick={() => moveTask(i, 1)} disabled={i === s.tasks.length - 1} aria-label={t("figures.gantt.moveDown", { n: i + 1 })} title={t("figures.gantt.moveDown", { n: i + 1 })}><ArrowDown size={15} /></button>
              <button type="button" className={iconBtn} onClick={() => update({ tasks: s.tasks.length > 1 ? s.tasks.filter((_, j) => j !== i) : [emptyTask()] })} aria-label={t("figures.gantt.removeTask", { n: i + 1 })} title={t("figures.gantt.removeTask", { n: i + 1 })}><Trash2 size={15} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 pl-[30px] items-center">
              <input value={r.start} onChange={(e) => setTask(i, { start: e.target.value })} placeholder="2026-03-15" inputMode="numeric" aria-label={`${t("figures.gantt.taskN", { n: i + 1 })} · ${t("figures.gantt.start")}`} aria-invalid={invalid("tasks", i, "start") || undefined} className={inputCls(invalid("tasks", i, "start"))} title={t("figures.gantt.start")} />
              <input value={r.milestone ? "" : r.end} disabled={r.milestone} onChange={(e) => setTask(i, { end: e.target.value })} placeholder={r.milestone ? "" : "2026-04-30"} inputMode="numeric" aria-label={`${t("figures.gantt.taskN", { n: i + 1 })} · ${t("figures.gantt.end")}`} aria-invalid={invalid("tasks", i, "end") || undefined} className={`${inputCls(invalid("tasks", i, "end"))} disabled:bg-gray-50`} title={t("figures.gantt.end")} />
              <input value={r.group} maxLength={GANTT_GROUP_MAX + 20} onChange={(e) => setTask(i, { group: e.target.value })} placeholder={t("figures.gantt.group")} aria-label={`${t("figures.gantt.taskN", { n: i + 1 })} · ${t("figures.gantt.group")}`} className={inputCls(false)} title={t("figures.gantt.groupHint")} />
              <label className="flex items-center gap-1.5 text-[13px] text-gray-700 min-w-0">
                <input type="checkbox" className="accent-brand-600" checked={r.milestone} onChange={(e) => setTask(i, { milestone: e.target.checked })} />
                {t("figures.gantt.milestone")}
              </label>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={addBtn} disabled={s.tasks.length >= GANTT_MAX_TASKS} onClick={() => update({ tasks: [...s.tasks, emptyTask()] })}>
          <Plus size={15} aria-hidden="true" />
          {t("figures.gantt.addTask")}
        </button>
        <span className="text-xs text-gray-500">{t("figures.gantt.count", { n: s.tasks.length, max: GANTT_MAX_TASKS })}</span>
      </div>
      <p className="text-xs text-gray-500">{t("figures.gantt.groupHint")}</p>
    </div>
  );

  // ---------- PRISMA ----------
  const countField = (k: PrismaCountKey) => (
    <label key={k} className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
      <span className="min-w-0">{t(PRISMA_LABEL_KEYS[k])}</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={s.counts[k] ?? ""}
        onChange={(e) => update({ counts: { ...s.counts, [k]: e.target.value } })}
        aria-invalid={invalid("counts", -1, k) || undefined}
        className={`${inputCls(invalid("counts", -1, k))} !w-28 flex-shrink-0 text-right tabular-nums`}
      />
    </label>
  );
  const subTitle = (key: string) => <div className="pt-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t(key)}</div>;
  const prismaGroup = (title: string, parts: { sub?: string; keys: readonly PrismaCountKey[] }[], extra?: React.ReactNode) => (
    <fieldset className="rounded-xl border border-gray-200 p-3 space-y-2">
      <legend className="px-1 text-[13px] font-semibold text-gray-800">{title}</legend>
      {parts.map((p, i) => (
        <div key={i} className="space-y-2">
          {p.sub && subTitle(p.sub)}
          {p.keys.map((k) => countField(k))}
        </div>
      ))}
      {extra}
    </fieldset>
  );
  const prisma = (
    <div className="space-y-3">
      <p className="text-xs text-gray-600">{t("figures.prisma.required")}</p>
      {prismaGroup(t("data.diagram.prisma.phase.identification"), [
        { sub: "data.diagram.prisma.identifiedFrom", keys: PRISMA_IDENTIFICATION_KEYS.slice(0, 2) },
        { sub: "data.diagram.prisma.removedBefore", keys: PRISMA_IDENTIFICATION_KEYS.slice(2) },
      ])}
      {prismaGroup(
        t("data.diagram.prisma.phase.screening"),
        [{ keys: PRISMA_SCREENING_KEYS }],
        <div className="pt-1 space-y-2">
          <div className="text-[13px] font-medium text-gray-700">{t("figures.prisma.reasons")}</div>
          {s.reasons.map((r, i) => (
            <div key={r.key} className="flex items-center gap-1.5">
              <input value={r.label} maxLength={PRISMA_REASON_MAX + 20} onChange={(e) => update({ reasons: s.reasons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={t("figures.prisma.reason")} aria-label={`${t("figures.prisma.reason")} ${i + 1}`} aria-invalid={invalid("reasons", i, "label") || undefined} className={inputCls(invalid("reasons", i, "label"))} />
              <input type="number" min={0} step={1} inputMode="numeric" value={r.n} onChange={(e) => update({ reasons: s.reasons.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)) })} placeholder={t("figures.prisma.reasonN")} aria-label={`${t("figures.prisma.reason")} ${i + 1} · ${t("figures.prisma.reasonN")}`} aria-invalid={invalid("reasons", i, "n") || undefined} className={`${inputCls(invalid("reasons", i, "n"))} !w-24 flex-shrink-0 text-right tabular-nums`} />
              <button type="button" className={iconBtn} onClick={() => update({ reasons: s.reasons.filter((_, j) => j !== i) })} aria-label={t("figures.prisma.removeReason", { n: i + 1 })} title={t("figures.prisma.removeReason", { n: i + 1 })}><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className={addBtn} disabled={s.reasons.length >= PRISMA_MAX_REASONS} onClick={() => update({ reasons: [...s.reasons, { key: nextKey(), label: "", n: "" }] })}>
            <Plus size={15} aria-hidden="true" />
            {t("figures.prisma.addReason")}
          </button>
        </div>
      )}
      {prismaGroup(t("data.diagram.prisma.phase.included"), [{ keys: PRISMA_INCLUDED_KEYS }])}
      <label className="flex items-start gap-2 text-[13px] text-gray-700">
        <input type="checkbox" className="accent-brand-600 mt-0.5" checked={s.otherMethods} onChange={(e) => update({ otherMethods: e.target.checked })} />
        {t("figures.prisma.otherMethods")}
      </label>
      {s.otherMethods &&
        prismaGroup(t("data.diagram.prisma.headerOther"), [
          { sub: "data.diagram.prisma.identifiedFrom", keys: PRISMA_OTHER_KEYS.slice(0, 3) },
          { keys: PRISMA_OTHER_KEYS.slice(3) },
        ])}
    </div>
  );

  // ---------- Concept map ----------
  const labelled = s.nodes.filter((n) => n.label.trim());
  const concept = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={sectionTitle}>{t("figures.concept.nodes")}</h3>
          <span className="text-xs text-gray-500">{t("figures.concept.count", { n: labelled.length, max: CONCEPT_MAX_NODES })}</span>
        </div>
        {s.nodes.map((n, i) => (
          <div key={n.id} className="flex items-center gap-1.5">
            <span className="w-6 text-right text-xs text-gray-500 tabular-nums flex-shrink-0">{i + 1}</span>
            <input ref={i === 0 ? firstField : undefined} value={n.label} maxLength={CONCEPT_LABEL_MAX + 20} onChange={(e) => update({ nodes: s.nodes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={t("figures.concept.nodeN", { n: i + 1 })} aria-label={t("figures.concept.nodeN", { n: i + 1 })} aria-invalid={invalid("nodes", i) || undefined} className={inputCls(invalid("nodes", i))} />
            <button type="button" className={iconBtn} onClick={() => update({ nodes: s.nodes.filter((_, j) => j !== i), edges: s.edges.filter((e) => e.from !== n.id && e.to !== n.id) })} aria-label={t("figures.concept.removeNode", { n: i + 1 })} title={t("figures.concept.removeNode", { n: i + 1 })}><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" className={addBtn} disabled={s.nodes.length >= CONCEPT_MAX_NODES} onClick={() => update({ nodes: [...s.nodes, { id: newNodeId(s.nodes), label: "" }] })}>
          <Plus size={15} aria-hidden="true" />
          {t("figures.concept.addNode")}
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={sectionTitle}>{t("figures.concept.links")}</h3>
          <span className="text-xs text-gray-500">{t("figures.concept.linkCount", { n: s.edges.length, max: CONCEPT_MAX_EDGES })}</span>
        </div>
        {!s.edges.length && <p className="text-xs text-gray-500">{t("figures.concept.noLinks")}</p>}
        {s.edges.map((e, i) => (
          <div key={e.key} className="rounded-xl border border-gray-200 p-2 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
            <select value={e.from} onChange={(ev) => update({ edges: s.edges.map((x, j) => (j === i ? { ...x, from: ev.target.value } : x)) })} aria-label={`${t("figures.concept.links")} ${i + 1} · ${t("figures.concept.from")}`} className={`${inputCls(invalid("edges", i, "from"))} col-span-1`}>
              <option value="">{t("figures.concept.from")}…</option>
              {labelled.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
            <button type="button" className={`${iconBtn} sm:order-last`} onClick={() => update({ edges: s.edges.filter((_, j) => j !== i) })} aria-label={t("figures.concept.removeLink", { n: i + 1 })} title={t("figures.concept.removeLink", { n: i + 1 })}><Trash2 size={15} /></button>
            <select value={e.to} onChange={(ev) => update({ edges: s.edges.map((x, j) => (j === i ? { ...x, to: ev.target.value } : x)) })} aria-label={`${t("figures.concept.links")} ${i + 1} · ${t("figures.concept.to")}`} className={`${inputCls(invalid("edges", i, "to"))} col-span-2 sm:col-span-1`}>
              <option value="">{t("figures.concept.to")}…</option>
              {labelled.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
            <input value={e.label} maxLength={CONCEPT_EDGE_LABEL_MAX + 10} onChange={(ev) => update({ edges: s.edges.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)) })} placeholder={t("figures.concept.linkLabel")} title={t("figures.concept.linkLabelHint")} aria-label={`${t("figures.concept.links")} ${i + 1} · ${t("figures.concept.linkLabel")}`} className={`${inputCls(invalid("edges", i, "label"))} col-span-2 sm:col-span-1`} />
          </div>
        ))}
        <button type="button" className={addBtn} disabled={s.edges.length >= CONCEPT_MAX_EDGES || labelled.length < 2} onClick={() => update({ edges: [...s.edges, { key: nextKey(), from: "", to: "", label: "" }] })}>
          <Plus size={15} aria-hidden="true" />
          {t("figures.concept.addLink")}
        </button>
        <p className="text-xs text-gray-500">{t("figures.concept.linkLabelHint")}</p>
      </div>
    </div>
  );

  const errorText = !check.ok && candidate.filled ? diagramErrorText(check.code, t) : "";
  const warnings = check.ok ? check.warnings : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(titleKey)}
      size="xl"
      footer={
        <div className="w-full flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-gray-600 sm:flex-1">{origin}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
              {t("common.cancel")}
            </button>
            <button type="button" disabled={!check.ok} onClick={submit} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">
              {editing ? t("figures.diagram.save") : t("figures.diagram.insert")}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4 min-w-0">
          {kind === "gantt" ? gantt : kind === "prisma" ? prisma : concept}
          <label className="block">
            <span className="block text-[13px] font-medium text-gray-700 mb-1">{t("figures.diagram.caption")}</span>
            <input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} placeholder={t("figures.diagram.captionPlaceholder")} className={inputCls(false)} />
          </label>
        </div>
        <div className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={sectionTitle}>{t("figures.diagram.preview")}</h3>
            <span className="text-xs text-gray-500">{t("figures.diagram.previewLang", { lang: LOCALE_NAMES[lang] })}</span>
          </div>
          <div ref={previewRef} className="fig-preview rounded-xl border border-gray-200 bg-white p-2 min-h-[160px] flex items-center justify-center overflow-hidden">
            {preview ? <div className="w-full" dangerouslySetInnerHTML={{ __html: preview.svg }} /> : <span className="px-4 text-center text-[13px] text-gray-500">{t("figures.diagram.previewEmpty")}</span>}
          </div>
          <div role="status" aria-live="polite">
            {errorText && (
              <p className="text-[13px] text-red-600">
                {errorLabel && <span className="font-medium">{errorLabel} · </span>}
                {errorText}
              </p>
            )}
            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[13px] font-semibold text-amber-800">{t("figures.diagram.notices")}</div>
                <ul className="mt-1 space-y-1 text-[13px] text-amber-900 list-disc pl-4">
                  {warnings.map((w, i) => (
                    <li key={`${w.code}-${i}`}>{diagramWarningText(w, t, (n) => fmt.number(n))}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-amber-800">{t("figures.diagram.noticesHint")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
