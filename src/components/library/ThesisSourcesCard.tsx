"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked } from "lucide-react";
import type { Reference } from "@/components/editor/types";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/client";
import { thesisCitationCounts } from "@/lib/sources/cited";
import { CHIP, ItemLink, LibraryItemRow, ReferenceTypeBadge, referenceMeta, SourceBadges, sourceMeta, type SourceLike } from "./LibraryItemRow";

/** A source as `GET /api/theses/[id]/sources` returns it (thesis view: no text, no owner, no other theses). */
type ThesisSourceItem = SourceLike & { id: string };

/**
 * Read-only "Sources & references" card for tutors and administrators: the sources and references this thesis uses,
 * nothing else from the student's library. The student sees the same items in the editor and on the library page
 * (principle 2). `thesis` is the detail response's thesis (content and tabs give the in-text citation counts).
 */
export default function ThesisSourcesCard({ thesis }: { thesis: { id: string; references?: Reference[]; content?: string; tabs?: { content?: string }[] } }) {
  const t = useT();
  const [sources, setSources] = useState<ThesisSourceItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    api<{ sources: ThesisSourceItem[] }>(`/api/theses/${encodeURIComponent(thesis.id)}/sources`)
      .then((r) => alive && setSources(r.sources || []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [thesis.id]);

  const references = useMemo(() => (Array.isArray(thesis.references) ? thesis.references.filter((r) => r && r.id) : []), [thesis.references]);
  const cited = useMemo(() => thesisCitationCounts(thesis), [thesis]);
  const referencedSources = useMemo(() => {
    const ids = new Set<string>();
    const dois = new Set<string>();
    for (const r of references) {
      if (r.sourceId) ids.add(r.sourceId);
      if (r.doi) dois.add(r.doi.toLowerCase());
    }
    return { ids, dois };
  }, [references]);

  const heading = "px-4 sm:px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500";
  const empty = "px-4 sm:px-5 py-4 text-sm text-gray-500";

  return (
    <div className="card mt-6">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BookMarked className="w-4 h-4 text-gray-500" aria-hidden="true" />
          <h2 className="font-semibold">{t("glossary.sourcesReferences")}</h2>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{t("admin.detail.sources.readOnly")}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-gray-100">
        <section aria-labelledby="thesis-sources-heading" className="min-w-0">
          <h3 id="thesis-sources-heading" className={heading}>{t("admin.detail.sources.sources", { n: sources ? sources.length : "…" })}</h3>
          {failed ? (
            <div className={empty}>{t("admin.detail.sources.loadFailed")}</div>
          ) : !sources ? (
            <div className={empty}>{t("common.loading")}…</div>
          ) : sources.length === 0 ? (
            <div className={empty}>{t("admin.detail.sources.noSources")}</div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {sources.map((s) => {
                const inRefs = referencedSources.ids.has(s.id) || (!!s.doi && referencedSources.dois.has(s.doi.toLowerCase()));
                return (
                  <LibraryItemRow key={s.id} kind={s.kind} title={s.title} meta={sourceMeta(s)} badges={<><SourceBadges source={s} />{inRefs && <span className={`${CHIP} bg-brand-50 text-brand-700`}>{t("admin.detail.sources.inReferences")}</span>}<ItemLink doi={s.doi} url={s.url} /></>} />
                );
              })}
            </ul>
          )}
        </section>
        <section aria-labelledby="thesis-references-heading" className="min-w-0 border-t border-gray-100 lg:border-t-0">
          <h3 id="thesis-references-heading" className={heading}>{t("admin.detail.sources.references", { n: references.length })}</h3>
          {references.length === 0 ? (
            <div className={empty}>{t("admin.detail.sources.noReferences")}</div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {references.map((r) => {
                const n = cited[r.id] || 0;
                return <LibraryItemRow key={r.id} kind="reference" title={r.title} meta={referenceMeta(r)} badges={<><ReferenceTypeBadge type={r.type} /><ItemLink doi={r.doi} url={r.url} /></>} extra={n > 0 ? t("admin.detail.sources.cited", { n }) : t("admin.detail.sources.notCited")} />;
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
