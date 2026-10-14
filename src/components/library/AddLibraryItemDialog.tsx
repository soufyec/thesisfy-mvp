"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui";
import type { LibraryReferenceView, LibrarySourceView, LibraryThesisOption, Reference } from "@/components/editor/types";
import { useFormat, useT } from "@/lib/i18n/client";
import { libraryCall, LibraryRequestError } from "./libraryApi";
import { LockedHints, lockedHintId, ThesisToggleChip } from "./LibraryControls";

export type AddKind = "source" | "reference";
type SourceTab = "doi" | "url" | "pdf" | "text";
type RefMode = "doi" | "manual";

const SOURCE_TABS: SourceTab[] = ["doi", "url", "pdf", "text"];
const REF_TYPES: Reference["type"][] = ["article", "book", "chapter", "web", "thesis"];
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const EMPTY_REF = { type: "article" as Reference["type"], authors: "", title: "", year: "", source: "", doi: "", url: "" };

/**
 * "Add to your library": a source (full text: DOI, URL, PDF or pasted text, like the editor's Sources panel) or a
 * reference (DOI lookup or manual fields). Both can be used in some of the student's theses right away; the thesis
 * selected on the page is preselected. Server errors arrive translated and are shown inside the dialog.
 */
export default function AddLibraryItemDialog({ open, onClose, initialKind, theses, defaultThesisId, onSourceAdded, onReferenceAdded }: { open: boolean; onClose: () => void; initialKind: AddKind; theses: LibraryThesisOption[]; defaultThesisId?: string; onSourceAdded: (source: LibrarySourceView, existing: boolean, linked: number) => void; onReferenceAdded: (reference: LibraryReferenceView, existing: boolean, linked: number) => void }) {
  const t = useT();
  const fmt = useFormat();
  const [kind, setKind] = useState<AddKind>(initialKind);
  const [tab, setTab] = useState<SourceTab>("doi");
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<RefMode>("doi");
  const [doi, setDoi] = useState("");
  const [ref, setRef] = useState(EMPTY_REF);
  const [useIn, setUseIn] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Why a locked thesis chip under "Use in" did not toggle (sighted users get no other feedback). */
  const [lockNote, setLockNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  // Reset the form each time the dialog opens (not when the page reloads its data while it is open).
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setKind(initialKind);
    setTab("doi");
    setValue("");
    setTitle("");
    setFile(null);
    setMode("doi");
    setDoi("");
    setRef(EMPTY_REF);
    setError("");
    setLockNote("");
    setBusy(false);
    const preset = theses.find((x) => x.id === defaultThesisId && !x.locked);
    setUseIn(preset ? [preset.id] : []);
  }, [open, initialKind, defaultThesisId, theses]);

  const ready = kind === "source" ? (tab === "pdf" ? !!file : !!value.trim()) : mode === "doi" ? !!doi.trim() : !!ref.title.trim();

  const submit = async () => {
    if (!ready || busy) return;
    setError("");
    if (kind === "source" && tab === "pdf" && file && file.size > MAX_PDF_BYTES) return setError(t("library.error.pdfTooLarge"));
    setBusy(true);
    try {
      if (kind === "source") {
        let r: { source: LibrarySourceView; existing?: boolean };
        if (tab === "pdf" && file) {
          const form = new FormData();
          form.append("file", file);
          if (title.trim()) form.append("title", title.trim());
          for (const id of useIn) form.append("thesisIds", id);
          r = await libraryCall(`/api/library/sources`, { method: "POST", body: form });
        } else {
          r = await libraryCall(`/api/library/sources`, { method: "POST", json: { kind: tab, value: value.trim(), title: title.trim() || undefined, thesisIds: useIn } });
        }
        onSourceAdded(r.source, !!r.existing, useIn.length);
      } else {
        const body = mode === "doi" ? { doi: doi.trim(), thesisIds: useIn } : { reference: { ...ref, doi: ref.doi.trim() || undefined, url: ref.url.trim() || undefined }, thesisIds: useIn };
        const r = await libraryCall<{ reference: LibraryReferenceView; existing?: boolean }>(`/api/library/references`, { method: "POST", json: body });
        onReferenceAdded(r.reference, !!r.existing, useIn.length);
      }
      onClose();
    } catch (e) {
      // Server errors arrive translated; anything else (no answer, an empty body) gets the generic sentence.
      setError((e instanceof LibraryRequestError && e.message) || t("dashboard.sources.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const segment = (on: boolean) => `flex-1 inline-flex items-center justify-center gap-1 text-[13px] py-2 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${on ? "bg-white text-gray-900 font-semibold shadow-sm" : "text-gray-600 hover:text-gray-900"}`;
  const subTab = (on: boolean) => `flex-1 text-xs py-1.5 px-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${on ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`;
  const field = "input-field !py-2 !text-[13px]";

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={t("dashboard.sources.addTitle")}
      size="lg"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="btn-outline !py-2 !px-4 text-sm disabled:opacity-40">{t("common.cancel")}</button>
          <button onClick={submit} disabled={!ready || busy} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40 gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {busy ? t("dashboard.sources.form.adding") : t("dashboard.sources.form.submit")}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex gap-1 p-1 rounded-xl bg-gray-100" role="group" aria-label={t("dashboard.sources.addKind")}>
          {(["source", "reference"] as AddKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setError(""); }} className={segment(kind === k)}>
              {t(`dashboard.sources.addKind.${k}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 -mt-2">{t(`dashboard.sources.addKind.${kind}Help`)}</p>

        {kind === "source" ? (
          <section className="space-y-2" aria-label={t("dashboard.sources.addKind.source")}>
            <div className="flex gap-1" role="group" aria-label={t("dashboard.sources.form.sourceType")}>
              {SOURCE_TABS.map((k) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => { setTab(k); setError(""); }} className={subTab(tab === k)}>
                  {t(`dashboard.sources.kind.${k}`)}
                </button>
              ))}
            </div>
            {tab === "doi" && <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="10.1038/s41586-019-0912-1" aria-label={t("dashboard.sources.form.doiLabel")} className={field} />}
            {tab === "url" && <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="https://…" type="url" aria-label={t("dashboard.sources.form.urlLabel")} className={field} />}
            {tab === "pdf" && (
              <label className="flex items-center gap-2 text-xs text-gray-600 border border-dashed border-gray-300 rounded-xl px-3 py-2.5 cursor-pointer hover:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/40">
                <Upload className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate">{file ? t("dashboard.sources.form.pdfPicked", { name: file.name, size: fmt.number(file.size / 1048576, { maximumFractionDigits: 1 }) }) : t("dashboard.sources.form.pdfChoose")}</span>
                <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={t("dashboard.sources.form.pdfLabel")} onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            )}
            {tab === "text" && <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("dashboard.sources.form.textPlaceholder")} aria-label={t("dashboard.sources.form.textLabel")} rows={5} className={`${field} resize-y`} />}
            <label className="block text-xs text-gray-500">
              {t("dashboard.sources.form.titleLabel")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mt-1`} />
            </label>
            <p className="text-[11px] text-gray-500">{t(`dashboard.sources.form.hint.${tab}`)}</p>
          </section>
        ) : (
          <section className="space-y-2" aria-label={t("dashboard.sources.addKind.reference")}>
            <div className="flex gap-1" role="group" aria-label={t("dashboard.sources.form.refMode")}>
              {(["doi", "manual"] as RefMode[]).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setError(""); }} className={subTab(mode === m)}>
                  {t(`dashboard.sources.form.refMode.${m}`)}
                </button>
              ))}
            </div>
            {mode === "doi" ? (
              <>
                <input autoFocus value={doi} onChange={(e) => setDoi(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="10.1038/s41586-019-0912-1" aria-label={t("dashboard.sources.form.doiLabel")} className={field} />
                <p className="text-[11px] text-gray-500">{t("dashboard.sources.form.refDoiHint")}</p>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500 col-span-2">
                  {t("dashboard.sources.form.title")}
                  <input autoFocus value={ref.title} onChange={(e) => setRef({ ...ref, title: e.target.value })} aria-required="true" className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-gray-500 col-span-2">
                  {t("dashboard.sources.form.authors")}
                  <input value={ref.authors} onChange={(e) => setRef({ ...ref, authors: e.target.value })} className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-gray-500">
                  {t("dashboard.sources.form.type")}
                  <select value={ref.type} onChange={(e) => setRef({ ...ref, type: e.target.value as Reference["type"] })} className={`${field} mt-1`}>
                    {REF_TYPES.map((x) => <option key={x} value={x}>{t(`dashboard.sources.refType.${x}`)}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  {t("dashboard.sources.form.year")}
                  <input value={ref.year} onChange={(e) => setRef({ ...ref, year: e.target.value })} inputMode="numeric" className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-gray-500 col-span-2">
                  {t("dashboard.sources.form.source")}
                  <input value={ref.source} onChange={(e) => setRef({ ...ref, source: e.target.value })} className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-gray-500 col-span-2 sm:col-span-1">
                  {t("dashboard.sources.form.doi")}
                  <input value={ref.doi} onChange={(e) => setRef({ ...ref, doi: e.target.value })} placeholder="10.…" className={`${field} mt-1`} />
                </label>
                <label className="text-xs text-gray-500 col-span-2 sm:col-span-1">
                  {t("dashboard.sources.form.url")}
                  <input value={ref.url} onChange={(e) => setRef({ ...ref, url: e.target.value })} placeholder="https://…" type="url" className={`${field} mt-1`} />
                </label>
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-gray-100 bg-gray-50 p-3" aria-labelledby="library-add-use-in">
          <div id="library-add-use-in" className="text-xs font-semibold text-gray-700 mb-2">{t("dashboard.sources.form.useIn")}</div>
          {theses.length === 0 ? (
            <p className="text-xs text-gray-500">{t("dashboard.sources.form.noTheses")}</p>
          ) : (
            <>
              <LockedHints theses={theses} scope="add-" />
              <div className="flex flex-wrap gap-1.5">
                {theses.map((x) => (
                  <ThesisToggleChip key={x.id} title={x.title} on={useIn.includes(x.id)} locked={x.locked} describedBy={lockedHintId("add-" + x.id)} onLocked={() => setLockNote(t("library.error.locked", { title: x.title }))} onToggle={() => setUseIn((list) => (list.includes(x.id) ? list.filter((id) => id !== x.id) : [...list, x.id]))} />
                ))}
              </div>
              {lockNote && (
                <p role="status" className="text-[11px] text-amber-700 mt-2">
                  {lockNote}
                </p>
              )}
              <p className="text-[11px] text-gray-500 mt-2">{t("dashboard.sources.form.useInHint")}</p>
            </>
          )}
        </section>

        {error && <div role="alert" className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{error}</div>}
      </div>
    </Modal>
  );
}
