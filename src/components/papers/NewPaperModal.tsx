"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { KindChip, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { fromDateInput } from "@/lib/deadline";
import { translate } from "@/lib/i18n/dictionary";
import { useLocale, useT } from "@/lib/i18n/client";
import { isThesisKind, type PaperKind, type WritingLanguage } from "@/lib/papers/kinds";
import { descLabelKey, templateFor } from "@/lib/papers/templates";
import { TemplateThumbnail } from "./TemplateGallery";
import { WritingLanguageField } from "./WritingLanguageField";

const CITATION_STYLES = ["APA", "MLA", "Chicago", "IEEE", "Harvard"] as const;
const MIN_TARGET = 100;
const MAX_TARGET = 200000;

const todayInput = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * "New paper" dialog of one template (docs/papers.md §4.1 item 4). The title is required; the description label follows
 * the kind (research question, prompt, aim…). The consequence sentence says what is created before the button.
 * Creates with `POST /api/theses` (the server writes the headings in the writing language) and opens the editor.
 */
export function NewPaperModal({ kind, onClose }: { kind: PaperKind | null; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const uid = useId();
  const tpl = templateFor(kind ?? "thesis");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState<WritingLanguage>(locale);
  const [due, setDue] = useState("");
  const [target, setTarget] = useState<string>(String(tpl.targetWords));
  const [style, setStyle] = useState<string>("APA");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A new kind starts a fresh form with that kind's defaults.
  useEffect(() => {
    if (!kind) return;
    setTitle("");
    setDescription("");
    setLang(locale);
    setDue("");
    setTarget(String(templateFor(kind).targetWords));
    setStyle("APA");
    setSaving(false);
    setError("");
  }, [kind, locale]);

  const targetNum = Number(target);
  const targetOk = Number.isInteger(targetNum) && targetNum >= MIN_TARGET && targetNum <= MAX_TARGET;
  const canCreate = !!title.trim() && targetOk && !saving;
  const blank = tpl.sections.length === 0;

  const create = async () => {
    if (!kind || !canCreate) return;
    setSaving(true);
    setError("");
    try {
      const d = await api<{ thesis: { id: string } }>("/api/theses", {
        method: "POST",
        json: { title: title.trim(), description: description.trim(), kind, templateId: tpl.id, writingLanguage: lang, deadline: fromDateInput(due), targetWords: targetNum, citationStyle: style },
      });
      router.push(`/dashboard/editor/${d.thesis.id}`);
    } catch (e) {
      setError((e as Error).message || t("papers.new.failed"));
      setSaving(false);
    }
  };

  const label = "block text-xs font-medium text-gray-600";
  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      size="lg"
      title={kind ? t(`papers.newTitle.${kind}`) : undefined}
      footer={
        <>
          <p className="w-full text-xs text-gray-600 leading-relaxed">{t(blank ? "papers.new.consequenceBlank" : "papers.new.consequence")}</p>
          <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={create} disabled={!canCreate} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40 disabled:shadow-none">
            {saving ? t("papers.new.creating") : t("papers.new.create")}
          </button>
        </>
      }
    >
      {kind && (
        <div className="sm:flex sm:gap-6">
          {/* Template preview: desktop only, the phone keeps the form short. */}
          <aside className="hidden sm:block sm:w-52 flex-shrink-0">
            <TemplateThumbnail motif={tpl.motif} kind={tpl.kind} />
            <div className="mt-3">
              <KindChip kind={kind} />
            </div>
            <h3 className="mt-3 text-xs font-semibold text-gray-600">{t("papers.new.headings")}</h3>
            {blank ? (
              <p className="mt-1 text-xs text-gray-500">{t("papers.new.noHeadings")}</p>
            ) : (
              // The headings as they will be written: in the paper's writing language, not the interface's.
              <ol lang={lang} className="mt-1.5 space-y-1 text-xs text-gray-600">
                {tpl.sections.map((s, i) => (
                  <li key={s.key + i} className="flex gap-2">
                    <span className="w-4 flex-shrink-0 text-right tabular-nums text-gray-500">{i + 1}</span>
                    <span className="min-w-0 break-words">{translate(lang, s.key)}</span>
                  </li>
                ))}
              </ol>
            )}
          </aside>

          <form
            className="min-w-0 flex-1 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            {error && (
              <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label htmlFor={`${uid}-title`} className={label}>
                {t("papers.new.titleLabel")}
              </label>
              <input id={`${uid}-title`} autoFocus required value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t("papers.new.titlePlaceholder")} className="input-field !py-2.5 mt-1" />
            </div>
            <div>
              <label htmlFor={`${uid}-desc`} className={label}>
                {t(descLabelKey(kind))} <span className="font-normal text-gray-500">({t("papers.new.optional")})</span>
              </label>
              <textarea id={`${uid}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-field !py-2.5 mt-1 resize-y" />
            </div>
            <WritingLanguageField value={lang} onChange={setLang} />
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-due`} className={label}>
                  {t("papers.new.due")} <span className="font-normal text-gray-500">({t("papers.new.optional")})</span>
                </label>
                <input id={`${uid}-due`} type="date" min={todayInput()} value={due} onChange={(e) => setDue(e.target.value)} className="input-field !py-2 mt-1" />
              </div>
              <div>
                <label htmlFor={`${uid}-target`} className={label}>
                  {t("papers.new.target")}
                </label>
                <input
                  id={`${uid}-target`}
                  type="number"
                  inputMode="numeric"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  step={100}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-invalid={!targetOk}
                  aria-describedby={`${uid}-target-help`}
                  className={`input-field !py-2 mt-1 ${targetOk ? "" : "!border-red-300"}`}
                />
                <p id={`${uid}-target-help`} className={`mt-1 text-xs ${targetOk ? "text-gray-500" : "text-red-600"}`}>
                  {t("papers.new.targetHelp")}
                </p>
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-style`} className={label}>
                {t("papers.new.citation")}
              </label>
              <select id={`${uid}-style`} value={style} onChange={(e) => setStyle(e.target.value)} className="input-field !py-2 mt-1">
                {CITATION_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {!isThesisKind(kind) && (
              <p className="flex gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                <Info className="mt-px h-4 w-4 flex-shrink-0 text-gray-400" strokeWidth={2} aria-hidden="true" />
                <span>{t("papers.new.noTeacher")}</span>
              </p>
            )}
            {/* Enter in a field submits; the visible button lives in the dialog footer. */}
            <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
          </form>
        </div>
      )}
    </Modal>
  );
}

export default NewPaperModal;
