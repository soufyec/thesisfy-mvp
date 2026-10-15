"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { AssignedCard, BriefModal } from "@/components/papers/AssignedCard";
import { ContinueCard } from "@/components/papers/ContinueCard";
import { NewPaperModal } from "@/components/papers/NewPaperModal";
import { PaperCard } from "@/components/papers/PaperCard";
import { TemplateFilterChips, TemplateGallery } from "@/components/papers/TemplateGallery";
import { byLastWorked, continuePicks, FOCUS_RING, isCompleted, type PaperListItem, type PapersResponse } from "@/components/papers/paperList";
import { DeadlineDialog, EmptyState, Toast } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";
import { useLocale, useT } from "@/lib/i18n/client";
import { isPaperKind, KIND_GROUP, PAPER_GROUPS, paperKind, type PaperGroup, type PaperKind, type WritingLanguage } from "@/lib/papers/kinds";
import { PAPER_TEMPLATES } from "@/lib/papers/templates";
import type { StudentAssignmentView } from "@/lib/papers/views";

type ToastState = { message: string; kind: "info" | "success" | "error" } | null;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Section title with an optional count chip. */
function SectionTitle({ id, title, count, as: Tag = "h2" }: { id: string; title: string; count?: number; as?: "h2" | "h3" }) {
  return (
    <div className="flex items-center gap-2">
      <Tag id={id} className={Tag === "h2" ? "text-base font-semibold text-gray-900" : "text-sm font-semibold text-gray-700"}>
        {title}
      </Tag>
      {count !== undefined && <span className="rounded-[10px] bg-gray-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-gray-600">{count}</span>}
    </div>
  );
}

/**
 * My papers (docs/papers.md §4.1): assignments to start, the papers to continue with their section strip, the template
 * gallery and every paper grouped by kind. Query: `?new=1` focuses the gallery, `?kind=<kind>` opens that template,
 * `?assignment=<id>` opens the paper of that assignment, or its brief, or says it is not available.
 */
function PapersInner() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useUser();
  const [data, setData] = useState<PapersResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<PaperGroup | "all">("all");
  const [showAll, setShowAll] = useState(false);
  const [newKind, setNewKind] = useState<PaperKind | null>(null);
  const [brief, setBrief] = useState<StudentAssignmentView | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [galleryFlash, setGalleryFlash] = useState(false);
  const [del, setDel] = useState<PaperListItem | null>(null);
  const [deadlineFor, setDeadlineFor] = useState<PaperListItem | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const galleryRef = useRef<HTMLElement>(null);
  const handledQuery = useRef<string | null>(null);
  const timers = useRef<number[]>([]);

  const load = useCallback(
    () =>
      api<PapersResponse>("/api/theses")
        .then((d) => {
          setData(d);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // Staff have their own list of papers.
  useEffect(() => {
    if (user && user.role !== "student") router.replace("/admin/theses");
  }, [user, router]);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const focusGallery = useCallback(() => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("[data-gallery] button")?.focus({ preventScroll: true });
    setGalleryFlash(true);
    later(() => setGalleryFlash(false), 1600);
  }, []);

  const cleanQuery = () => window.history.replaceState(null, "", "/dashboard/papers");

  // Query parameters, once the list is known (the gallery moves when the sections above it appear).
  useEffect(() => {
    if (!data && !failed) return;
    const key = params.toString();
    if (!key) {
      // Cleaned: the same link (a notification clicked twice) can be handled again.
      handledQuery.current = null;
      return;
    }
    if (handledQuery.current === key) return;
    handledQuery.current = key;
    const assignmentId = params.get("assignment");
    const kind = params.get("kind");
    if (assignmentId) {
      const paper = data?.theses.find((p) => p.assignmentId === assignmentId);
      if (paper) {
        router.replace(`/dashboard/editor/${paper.id}`);
        return;
      }
      cleanQuery();
      const open = data?.assignments?.find((a) => a.id === assignmentId);
      if (open) {
        setHighlightId(open.id);
        requestAnimationFrame(() => document.getElementById(`assignment-${open.id}`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" }));
        setBrief(open);
        later(() => setHighlightId((h) => (h === open.id ? null : h)), 4000);
        return;
      }
      api<{ assignment: StudentAssignmentView }>(`/api/assignments/${encodeURIComponent(assignmentId)}`)
        .then((r) => {
          if (r.assignment.paperId) router.replace(`/dashboard/editor/${r.assignment.paperId}`);
          else setToast({ message: t("papers.assignment.unavailable"), kind: "info" });
        })
        .catch(() => setToast({ message: t("papers.assignment.unavailable"), kind: "info" }));
      return;
    }
    if (kind && isPaperKind(kind)) {
      cleanQuery();
      setNewKind(kind);
      return;
    }
    if (params.get("new") === "1") {
      cleanQuery();
      requestAnimationFrame(focusGallery);
    }
  }, [data, failed, params, router, t, focusGallery]);

  const start = async (a: StudentAssignmentView, writingLanguage: WritingLanguage) => {
    setStartingId(a.id);
    try {
      const r = await api<{ thesis: { id: string } }>(`/api/assignments/${encodeURIComponent(a.id)}/start`, { method: "POST", json: { writingLanguage } });
      router.push(`/dashboard/editor/${r.thesis.id}`);
    } catch (e) {
      setToast({ message: (e as Error).message || t("papers.assigned.startFailed"), kind: "error" });
      setStartingId(null);
      load();
    }
  };

  const remove = async (p: PaperListItem) => {
    try {
      await api(`/api/theses/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      setToast({ message: t("papers.work.deleted"), kind: "success" });
    } catch (e) {
      setToast({ message: (e as Error).message || t("papers.work.deleteFailed"), kind: "error" });
    }
    load();
  };

  const saveDeadline = async (iso: string | undefined) => {
    const p = deadlineFor;
    if (!p || p.assignmentId) return;
    await api(`/api/theses/${encodeURIComponent(p.id)}`, { method: "PUT", json: { deadline: iso || "" } });
    setData((d) => (d ? { ...d, theses: d.theses.map((x) => (x.id === p.id ? { ...x, deadline: iso } : x)) } : d));
  };

  const papers = data?.theses || [];
  const assignments = data?.assignments || [];
  const picks = continuePicks(papers);
  const open = papers.filter((p) => !isCompleted(p)).sort(byLastWorked);
  const completed = papers.filter(isCompleted).sort(byLastWorked);
  const groups = PAPER_GROUPS.map((g) => ({ g, items: open.filter((p) => KIND_GROUP[paperKind(p)] === g) })).filter((x) => x.items.length > 0);
  const cardProps = { onDelete: (p: PaperListItem) => setDel(p), onEditDeadline: (p: PaperListItem) => setDeadlineFor(p) };

  return (
    <div className="max-w-6xl">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-[-0.01em] text-gray-900">{t("glossary.myPapers")}</h1>
          <p className="mt-1 max-w-2xl text-pretty text-sm text-gray-500">{t("papers.page.subtitle")}</p>
        </div>
        <button type="button" onClick={focusGallery} className={`btn-primary !py-2.5 !px-4 gap-1.5 self-start sm:self-auto ${FOCUS_RING}`}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {t("papers.page.new")}
        </button>
      </header>

      <div className="space-y-10">
        {assignments.length > 0 && (
          <section aria-labelledby="assigned-title">
            <SectionTitle id="assigned-title" title={t("papers.assigned.title")} count={assignments.length} />
            {/* Two columns like the Continue row below; a third only when there are three or more to show. */}
            <div className={`mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 ${assignments.length >= 3 ? "xl:grid-cols-3" : ""}`}>
              {assignments.map((a) => (
                <AssignedCard key={a.id} assignment={a} highlighted={highlightId === a.id} starting={startingId === a.id} onReadBrief={() => setBrief(a)} onStart={() => start(a, locale)} />
              ))}
            </div>
          </section>
        )}

        {picks.length > 0 && (
          <section aria-labelledby="continue-title">
            <SectionTitle id="continue-title" title={t("papers.continue.title")} />
            <div className={`mt-4 grid grid-cols-1 gap-4 ${picks.length > 1 ? "lg:grid-cols-2" : ""}`}>
              {picks.map((p) => (
                <ContinueCard key={p.id} paper={p} />
              ))}
            </div>
          </section>
        )}

        <section ref={galleryRef} aria-labelledby="gallery-title" className="scroll-mt-24">
          <SectionTitle id="gallery-title" title={t("papers.gallery.title")} />
          <p className="mt-1 text-sm text-gray-500">{t("papers.gallery.subtitle")}</p>
          <div className="mt-4">
            <TemplateFilterChips value={filter} onChange={setFilter} />
          </div>
          <div data-gallery className={`mt-3 rounded-2xl motion-safe:transition-shadow motion-safe:duration-500 ${galleryFlash ? "ring-2 ring-brand-300 ring-offset-4 ring-offset-gray-50" : "ring-0"}`}>
            <TemplateGallery filter={filter} featuredOnly={!showAll} onPick={setNewKind} />
          </div>
          {filter === "all" && (
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 ${FOCUS_RING}`}>
                {showAll ? t("papers.gallery.fewer") : t("papers.gallery.all", { n: PAPER_TEMPLATES.length })}
                <ChevronDown className={`h-4 w-4 motion-safe:transition-transform ${showAll ? "rotate-180" : ""}`} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </section>

        <section aria-labelledby="work-title">
          <SectionTitle id="work-title" title={t("papers.work.title")} count={data ? papers.length : undefined} />
          <div className="mt-4">
            {!data && !failed ? (
              <div className="card p-8 text-center text-sm text-gray-500">{t("common.loading")}…</div>
            ) : failed && !data ? (
              <div className="card p-8 text-center">
                <p className="text-sm text-gray-600">{t("papers.page.loadFailed")}</p>
                <button type="button" onClick={() => load()} className={`btn-outline !border mt-3 !py-2 !px-4 text-sm ${FOCUS_RING}`}>
                  {t("papers.page.retry")}
                </button>
              </div>
            ) : papers.length === 0 ? (
              <EmptyState title={t("papers.work.empty")} />
            ) : (
              <div className="space-y-8">
                {groups.map(({ g, items }) => (
                  <div key={g} role="group" aria-labelledby={`group-${g}`}>
                    <SectionTitle as="h3" id={`group-${g}`} title={t(`papers.group.${g}`)} count={items.length} />
                    <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {items.map((p) => (
                        <PaperCard key={p.id} paper={p} {...cardProps} />
                      ))}
                    </div>
                  </div>
                ))}
                {completed.length > 0 && (
                  <div className="border-t border-gray-200 pt-6">
                    <button type="button" onClick={() => setCompletedOpen((o) => !o)} aria-expanded={completedOpen} aria-controls="completed-list" className={`-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}>
                      <ChevronRight className={`h-4 w-4 text-gray-400 motion-safe:transition-transform ${completedOpen ? "rotate-90" : ""}`} strokeWidth={2} aria-hidden="true" />
                      {t("papers.work.completed", { n: completed.length })}
                    </button>
                    {completedOpen && (
                      <div id="completed-list" className="mt-3">
                        <p className="text-xs text-gray-500">{t("papers.work.completedHelp")}</p>
                        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          {completed.map((p) => (
                            <PaperCard key={p.id} paper={p} {...cardProps} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <NewPaperModal kind={newKind} onClose={() => setNewKind(null)} />
      <BriefModal assignment={brief} starting={!!brief && startingId === brief.id} onClose={() => setBrief(null)} onStart={(lang) => brief && start(brief, lang)} />
      <DeadlineDialog open={!!deadlineFor} onClose={() => setDeadlineFor(null)} deadline={deadlineFor?.deadline} onSave={saveDeadline} />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={t("papers.work.deleteTitle")}
        danger
        confirmLabel={t("papers.work.delete")}
        body={t("papers.work.deleteBody", { title: del?.title || "" })}
        onConfirm={() => {
          if (del) remove(del);
        }}
      />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={closeToast} />}
    </div>
  );
}

export default function PapersPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <PapersInner />
      </Suspense>
    </DashboardLayout>
  );
}
