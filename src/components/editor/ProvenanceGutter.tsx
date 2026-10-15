"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { provenanceStatsKey, type BlockProvenance } from "./extensions";
import { useFormat, useT } from "@/lib/i18n/client";
import { modeLabel, providerLabel, type InteractionLite } from "./types";
import { readChartSpec, type ChartAttrs } from "./chart";

interface Props {
  editor: Editor;
  /** The document sheet (`.docs-page`); gutter positions are measured relative to it. */
  sheetRef: RefObject<HTMLDivElement>;
  /** AI log entries of this thesis, used to name the model, the mode and the date of an AI-assisted block. */
  interactions?: InteractionLite[];
  /** Show the right-margin annotation on every AI or pasted block (review mode) instead of on hover only. */
  alwaysAnnotate?: boolean;
  /** Current document zoom as a fraction (1 = 100%); the sheet is scaled with CSS `zoom`. */
  zoom?: number;
}

interface Placed extends BlockProvenance {
  top: number;
  height: number;
}

/** An AI-assisted figure (`chart` node) or equation (`math`, `mathBlock`): it has no words, so it gets its own label. */
interface Mark {
  /** Document position of the node (unique; also the hover key). */
  pos: number;
  kind: "fig" | "eq";
  /** Inline equation: labelled on its line, left of the paragraph's own ¶ label, without a bar. */
  inline: boolean;
  top: number;
  height: number;
  provider: string | null;
  interaction: string | null;
  /** Data file of a computed chart, or the class of a diagram (shown in the note). */
  file: string;
  figure: string;
}

const COLOR = { human: "bg-prov-human", ai: "bg-prov-ai", paste: "bg-prov-paste" } as const;
const NOTE_TEXT = { ai: "text-prov-ai", paste: "text-prov-paste-deep" } as const;
const NOTE_BORDER = { ai: "border-prov-ai", paste: "border-prov-paste" } as const;

/**
 * Provenance gutter: for every top-level block, a label (¶n · AI · Q) and a 3px bar in the left margin of the
 * sheet, coloured by the dominant source of its words, plus a right-margin note for AI-assisted and pasted blocks.
 * AI-assisted figures and equations have no words: they get "Fig · AI" / "Eq · AI" (D21, D23) with the note
 * provider · file · date; figures and equations the student made get no label.
 * Positions follow the editor DOM and are recomputed on every update and resize.
 */
export default function ProvenanceGutter({ editor, sheetRef, interactions = [], alwaysAnnotate = false, zoom = 1 }: Props) {
  const t = useT();
  const fmt = useFormat();
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const frame = useRef<number | null>(null);
  // The gutter box covers the sheet's content area (inside the page margins); every offset is relative to it.
  const rootRef = useRef<HTMLDivElement>(null);
  const byInteraction = useMemo(() => new Map(interactions.map((i) => [i.id, i])), [interactions]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root || !sheetRef.current || editor.isDestroyed) return;
    const blocks = provenanceStatsKey.getState(editor.state) || [];
    const rootRect = root.getBoundingClientRect();
    const z = zoom || 1;
    const next: Placed[] = [];
    for (const b of blocks) {
      const dom = editor.view.nodeDOM(b.pos) as HTMLElement | null;
      if (!dom || !(dom instanceof HTMLElement)) continue;
      const r = dom.getBoundingClientRect();
      if (!r.height) continue;
      next.push({ ...b, top: (r.top - rootRect.top) / z, height: r.height / z });
    }
    setPlaced(next);
    // AI-assisted figures and equations (D21, D23): top-level figures and block equations get "Fig · AI" / "Eq · AI"
    // and a bar along their height; inline equations a label on their line. Human-made ones get no label.
    const found: Mark[] = [];
    const place = (pos: number, kind: Mark["kind"], inline: boolean, attrs: Record<string, unknown>) => {
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
      if (!dom || !(dom instanceof HTMLElement)) return;
      const r = dom.getBoundingClientRect();
      if (!r.height) return;
      let file = "";
      let figure = "";
      if (kind === "fig") {
        const spec = readChartSpec((attrs as unknown as ChartAttrs).spec, (attrs as unknown as ChartAttrs).figure);
        figure = String(attrs.figure || "chart");
        file = spec?.fileName || "";
      }
      found.push({ pos, kind, inline, top: (r.top - rootRect.top) / z, height: r.height / z, provider: (attrs.provider as string) || null, interaction: (attrs.interaction as string) || null, file, figure });
    };
    editor.state.doc.forEach((node, offset) => {
      if (node.type.name === "chart") {
        if (node.attrs.origin !== "human") place(offset, "fig", false, node.attrs);
        return;
      }
      if (node.type.name === "mathBlock") {
        if (node.attrs.origin === "ai") place(offset, "eq", false, node.attrs);
        return;
      }
      if (node.isAtom || node.isLeaf) return;
      let lastTop = -Infinity;
      node.descendants((child, p) => {
        if (child.type.name === "chart" && child.attrs.origin !== "human") place(offset + 1 + p, "fig", false, child.attrs);
        else if (child.type.name === "mathBlock" && child.attrs.origin === "ai") place(offset + 1 + p, "eq", false, child.attrs);
        else if (child.type.name === "math" && child.attrs.origin === "ai") {
          const before = found.length;
          place(offset + 1 + p, "eq", true, child.attrs);
          // One label per line: a second AI equation on the same line adds nothing.
          if (found.length > before) {
            const m = found[found.length - 1];
            if (Math.abs(m.top - lastTop) < 4) found.pop();
            else lastTop = m.top;
          }
        }
        return !child.isAtom;
      });
    });
    setMarks(found);
  }, [editor, sheetRef, zoom]);

  const schedule = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    schedule();
    editor.on("update", schedule);
    editor.on("create", schedule);
    const sheet = sheetRef.current;
    const ro = typeof ResizeObserver !== "undefined" && sheet ? new ResizeObserver(schedule) : null;
    if (sheet && ro) ro.observe(sheet);
    window.addEventListener("resize", schedule);
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(schedule).catch(() => {});
    return () => {
      editor.off("update", schedule);
      editor.off("create", schedule);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [editor, sheetRef, schedule]);

  // Hover tracking on the sheet: the gutter itself never takes pointer events, so the text stays editable.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || alwaysAnnotate) return;
    let raf: number | null = null;
    const onMove = (e: MouseEvent) => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const rect = (rootRef.current || sheet).getBoundingClientRect();
        const y = (e.clientY - rect.top) / (zoom || 1);
        const mark = marks.find((m) => y >= m.top && y <= m.top + m.height);
        const hit = mark || placed.find((p) => y >= p.top && y <= p.top + p.height);
        setHovered(hit ? hit.pos : null);
      });
    };
    const onLeave = () => setHovered(null);
    sheet.addEventListener("mousemove", onMove);
    sheet.addEventListener("mouseleave", onLeave);
    return () => {
      sheet.removeEventListener("mousemove", onMove);
      sheet.removeEventListener("mouseleave", onLeave);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [sheetRef, placed, marks, alwaysAnnotate, zoom]);

  const wordsLabel = (n: number) => (n === 1 ? t("common.word_one") : t("common.words", { n }));
  const note = (b: Placed): { line1: string; line2: string } | null => {
    if (!b.first) return null;
    const words = b.first.source === "ai" ? b.words.ai : b.words.paste;
    if (b.first.source === "ai") {
      const ix = b.first.interactionId ? byInteraction.get(b.first.interactionId) : undefined;
      const provider = providerLabel(t, ix?.provider || b.first.provider);
      const mode = ix ? modeLabel(t, ix.mode) : b.first.label || t("glossary.aiAssisted");
      const when = ix && !Number.isNaN(new Date(ix.timestamp).getTime()) ? fmt.date(ix.timestamp, { day: "numeric", month: "short" }) : "";
      return { line1: `${provider} · ${mode}`, line2: `${when ? `${when}, ` : ""}${wordsLabel(words)}` };
    }
    return { line1: b.first.label ? t("editor.gutter.pastedAttributed") : t("editor.gutter.pastedNoSource"), line2: b.first.label || wordsLabel(words) };
  };
  /**
   * Note of an AI figure or equation: the provider, then date · file (a computed chart) or date · class (a diagram).
   * The note column is narrow, so the date comes before the file name, which may be cut.
   */
  const markNote = (m: Mark): { line1: string; line2: string } => {
    const ix = m.interaction ? byInteraction.get(m.interaction) : undefined;
    const provider = providerLabel(t, ix?.provider || m.provider);
    const what = m.kind === "eq" ? "" : m.file || (m.figure && m.figure !== "chart" ? t(`figures.kind.${m.figure}`) : "");
    const when = ix && !Number.isNaN(new Date(ix.timestamp).getTime()) ? fmt.date(ix.timestamp, { day: "numeric", month: "short" }) : "";
    const kindLabel = m.kind === "eq" ? t("figures.gutter.equationNote") : t("glossary.figure");
    return { line1: provider, line2: [when, what].filter(Boolean).join(" · ") || kindLabel };
  };

  // Right-margin notes never overlap: each starts below the previous one.
  const notes: { key: string; top: number; source: "ai" | "paste"; line1: string; line2: string }[] = [];
  for (const b of placed) {
    if (b.dominant === "human" && b.heading) continue;
    const n = b.first && (alwaysAnnotate || hovered === b.pos) ? note(b) : null;
    if (n && b.first) notes.push({ key: `b${b.pos}`, top: b.top + 2, source: b.first.source, ...n });
  }
  for (const m of marks) if (alwaysAnnotate || hovered === m.pos) notes.push({ key: `m${m.pos}`, top: m.top + 2, source: "ai", ...markNote(m) });
  notes.sort((x, y) => x.top - y.top);
  for (let i = 1; i < notes.length; i++) notes[i].top = Math.max(notes[i].top, notes[i - 1].top + 34);

  return (
    <div ref={rootRef} className="prov-gutter" aria-hidden="true" data-testid="provenance-gutter">
      {placed.map((b) => {
        const show = b.dominant !== "human" || !b.heading;
        if (!show || b.heading) return null;
        const labelClass = b.dominant === "ai" ? "text-prov-ai font-bold" : b.dominant === "paste" ? "text-prov-paste-deep font-bold" : "text-gray-400";
        const label = b.dominant === "ai" ? "AI" : b.dominant === "paste" ? "Q" : `¶${b.index}`;
        return (
          <div key={b.pos} className={`prov-gutter-label ${labelClass}`} style={{ top: b.top + 4, height: Math.max(8, b.height - 8) }}>
            <span className="w-[18px] text-right leading-none pt-px">{label}</span>
            <span className={`prov-gutter-bar ${COLOR[b.dominant]}`} />
          </div>
        );
      })}
      {marks.map((m) =>
        m.inline ? (
          <div key={`m${m.pos}`} className="prov-gutter-fig prov-gutter-eq-inline text-prov-ai font-bold" style={{ top: m.top + Math.max(0, m.height / 2 - 5) }}>
            {t("figures.gutter.equationAi")}
          </div>
        ) : (
          <div key={`m${m.pos}`}>
            <div className="prov-gutter-fig text-prov-ai font-bold" style={{ top: m.top + 4 }}>
              {m.kind === "fig" ? t("figures.gutter.figureAi") : t("figures.gutter.equationAi")}
            </div>
            <span className={`prov-gutter-fig-bar ${COLOR.ai}`} style={{ top: m.top + 4, height: Math.max(8, m.height - 8) }} />
          </div>
        )
      )}
      {notes.map((n) => (
        <div key={n.key} className={`prov-note ${NOTE_TEXT[n.source]} ${NOTE_BORDER[n.source]}`} style={{ top: n.top }}>
          <div className="font-medium truncate">{n.line1}</div>
          <div className="text-gray-400 truncate">{n.line2}</div>
        </div>
      ))}
    </div>
  );
}
