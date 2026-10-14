"use client";

import { BookOpen, ExternalLink, FileText, Link2, Quote, Type as TypeIcon } from "lucide-react";
import type { Reference } from "@/components/editor/types";
import type { Translate } from "@/lib/i18n/dictionary";
import { useFormat, useT } from "@/lib/i18n/client";

/**
 * Shared, presentational pieces of a library item (source or reference). Used by the student's library page
 * (/dashboard/sources) and, read-only, by the tutor's thesis page, so both show the same item the same way
 * (principle 2). Strings live in `dashboard.sources.*` (messages/dashboard.ts).
 */

/** The fields of a source both the owner view (`LibrarySourceView`) and the thesis view (`PublicSource`) carry. */
export interface SourceLike {
  kind: "doi" | "url" | "pdf" | "text";
  title: string;
  authors?: string;
  year?: string;
  venue?: string;
  doi?: string;
  url?: string;
  wordCount: number;
  parseStatus?: "pending" | "parsed" | "no_text" | "failed";
  coverage: "full_text" | "abstract" | "none";
}

/** 10px-radius chip, the shape CLAUDE.md §4 gives chips. */
export const CHIP = "inline-flex items-center gap-1 rounded-[10px] px-2 py-0.5 text-[11px] font-medium";

export function hostOf(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** "Authors · year · venue" for a source (empty parts are skipped). */
export function sourceMeta(s: Pick<SourceLike, "authors" | "year" | "venue" | "url">) {
  return [s.authors, s.year, s.venue || hostOf(s.url)].filter(Boolean).join(" · ");
}

/** "Authors · year · journal/publisher" for a reference. */
export function referenceMeta(r: Pick<Reference, "authors" | "year" | "source">) {
  return [r.authors, r.year, r.source].filter(Boolean).join(" · ");
}

/** Coverage of a source: what the assistant can actually read from it. */
export function coverageChip(s: Pick<SourceLike, "parseStatus" | "coverage">, t: Translate): { label: string; className: string } {
  if (s.parseStatus === "pending") return { label: t("dashboard.sources.coverage.indexing"), className: "bg-gray-100 text-gray-600" };
  if (s.parseStatus === "failed") return { label: t("dashboard.sources.coverage.failed"), className: "bg-red-50 text-red-700" };
  if (s.coverage === "full_text") return { label: t("dashboard.sources.coverage.full"), className: "bg-accent-50 text-accent-900" };
  if (s.coverage === "abstract") return { label: t("dashboard.sources.coverage.abstract"), className: "bg-amber-50 text-amber-700" };
  return { label: t("dashboard.sources.coverage.none"), className: "bg-gray-100 text-gray-600" };
}

const KIND_ICON: Record<SourceLike["kind"], typeof FileText> = { doi: BookOpen, url: Link2, pdf: FileText, text: TypeIcon };

export function SourceKindIcon({ kind }: { kind: SourceLike["kind"] }) {
  const Icon = KIND_ICON[kind] || FileText;
  return <Icon className="w-4 h-4" aria-hidden="true" />;
}

/** Kind, coverage and length of a source. */
export function SourceBadges({ source }: { source: SourceLike }) {
  const t = useT();
  const fmt = useFormat();
  const chip = coverageChip(source, t);
  return (
    <>
      <span className={`${CHIP} bg-gray-100 text-gray-600`}>{t(`dashboard.sources.kind.${source.kind}`)}</span>
      <span className={`${CHIP} ${chip.className}`}>{chip.label}</span>
      {source.wordCount > 0 && <span className="text-[11px] text-gray-500">{source.wordCount === 1 ? t("common.word_one") : t("common.words", { n: fmt.number(source.wordCount) })}</span>}
    </>
  );
}

/** Kind of a reference (article, book…). */
export function ReferenceTypeBadge({ type }: { type: Reference["type"] }) {
  const t = useT();
  const key = `dashboard.sources.refType.${type}`;
  const label = t(key);
  return <span className={`${CHIP} bg-gray-100 text-gray-600`}>{label === key ? type : label}</span>;
}

/** The DOI (preferred) or URL of an item, opened in a new tab. Renders nothing when there is neither. */
export function ItemLink({ doi, url }: { doi?: string; url?: string }) {
  const t = useT();
  const href = doi ? `https://doi.org/${doi}` : url;
  if (!href || !/^https?:\/\//i.test(href)) return null;
  const label = doi ? `doi.org/${doi}` : hostOf(url) || url || "";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-w-0 max-w-full text-[11px] text-brand-600 hover:underline" aria-label={t("dashboard.sources.openLink", { label })}>
      <ExternalLink className="w-[15px] h-[15px] flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </a>
  );
}

/**
 * One item of a list: icon, title, meta line, badges (with the link), an optional extra line, and the controls
 * (`actions` top right, `children` below). Mobile first: everything wraps inside the row at 390px.
 */
export function LibraryItemRow({ kind, title, meta, badges, extra, actions, children, busy }: { kind: SourceLike["kind"] | "reference"; title: string; meta?: React.ReactNode; badges?: React.ReactNode; extra?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; busy?: boolean }) {
  return (
    <li className="p-4 sm:p-5 flex gap-3 min-w-0" aria-busy={busy || undefined}>
      <span className="hidden sm:flex w-9 h-9 rounded-xl bg-gray-50 text-gray-500 items-center justify-center flex-shrink-0" aria-hidden="true">
        {kind === "reference" ? <Quote className="w-4 h-4" /> : <SourceKindIcon kind={kind} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 break-words">{title}</h3>
            {meta && <p className="text-xs text-gray-500 mt-0.5 break-words">{meta}</p>}
          </div>
          {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
        </div>
        {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5 min-w-0">{badges}</div>}
        {extra && <div className="mt-1.5 text-xs text-gray-500 break-words">{extra}</div>}
        {children}
      </div>
    </li>
  );
}
