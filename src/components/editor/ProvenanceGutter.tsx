"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { provenanceStatsKey, type BlockProvenance } from "./extensions";
import { MODE_LABELS, PROVIDER_LABELS, type InteractionLite } from "./types";

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

const COLOR = { human: "bg-prov-human", ai: "bg-prov-ai", paste: "bg-prov-paste" } as const;
const NOTE_TEXT = { ai: "text-prov-ai", paste: "text-prov-paste-deep" } as const;
const NOTE_BORDER = { ai: "border-prov-ai", paste: "border-prov-paste" } as const;

function providerName(id?: string | null) {
  if (!id) return "AI";
  return PROVIDER_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Provenance gutter: for every top-level block, a label (¶n · AI · Q) and a 3px bar in the left margin of the
 * sheet, coloured by the dominant source of its words, plus a right-margin note for AI-assisted and pasted blocks.
 * Positions follow the editor DOM and are recomputed on every update and resize.
 */
export default function ProvenanceGutter({ editor, sheetRef, interactions = [], alwaysAnnotate = false, zoom = 1 }: Props) {
  const [placed, setPlaced] = useState<Placed[]>([]);
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
        const hit = placed.find((p) => y >= p.top && y <= p.top + p.height);
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
  }, [sheetRef, placed, alwaysAnnotate, zoom]);

  const note = (b: Placed): { line1: string; line2: string } | null => {
    if (!b.first) return null;
    const words = b.first.source === "ai" ? b.words.ai : b.words.paste;
    if (b.first.source === "ai") {
      const ix = b.first.interactionId ? byInteraction.get(b.first.interactionId) : undefined;
      const provider = providerName(ix?.provider || b.first.provider);
      const mode = ix ? MODE_LABELS[ix.mode] || ix.mode : b.first.label || "AI-assisted";
      const when = ix ? shortDate(ix.timestamp) : "";
      return { line1: `${provider} · ${mode}`, line2: `${when ? `${when}, ` : ""}${words} words` };
    }
    return { line1: b.first.label ? "Pasted · attributed" : "Pasted · source not given", line2: b.first.label || `${words} words` };
  };

  return (
    <div ref={rootRef} className="prov-gutter" aria-hidden="true" data-testid="provenance-gutter">
      {placed.map((b) => {
        const show = b.dominant !== "human" || !b.heading;
        if (!show) return null;
        const n = b.first && (alwaysAnnotate || hovered === b.pos) ? note(b) : null;
        const labelClass = b.dominant === "ai" ? "text-prov-ai font-bold" : b.dominant === "paste" ? "text-prov-paste-deep font-bold" : "text-gray-400";
        const label = b.dominant === "ai" ? "AI" : b.dominant === "paste" ? "Q" : b.heading ? "" : `¶${b.index}`;
        return (
          <div key={b.pos}>
            {!b.heading && (
              <div className={`prov-gutter-label ${labelClass}`} style={{ top: b.top + 4, height: Math.max(8, b.height - 8) }}>
                <span className="w-[18px] text-right leading-none pt-px">{label}</span>
                <span className={`prov-gutter-bar ${COLOR[b.dominant]}`} />
              </div>
            )}
            {n && b.first && (
              <div className={`prov-note ${NOTE_TEXT[b.first.source]} ${NOTE_BORDER[b.first.source]}`} style={{ top: b.top + 2 }}>
                <div className="font-medium truncate">{n.line1}</div>
                <div className="text-gray-400 truncate">{n.line2}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
