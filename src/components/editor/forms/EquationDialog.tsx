"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Modal } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { MAX_LATEX_LENGTH, supportedCommands, supportedEnvironments } from "@/lib/math/latex";
import { latexToMathML } from "@/lib/math/mathml";
import { latexErrorMessage, type MathOrigin } from "../math";

export interface EquationDialogValue {
  latex: string;
  /** true: on its own line (`mathBlock`); false: in the line of text (`math`). */
  display: boolean;
  /** Block equations only: numbered "(n)" in the right margin. */
  numbered: boolean;
}

export interface EquationDialogProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing equation: its LaTeX, layout and origin. The layout cannot change while editing. */
  initial?: { latex: string; display: boolean; numbered?: boolean; origin?: MathOrigin };
  /** Called with valid LaTeX only (the button stays disabled while the LaTeX cannot be drawn). */
  onSubmit: (value: EquationDialogValue) => void;
}

/** Commands the help list shows as LaTeX (letters only; symbols such as `\{` are described by the intro). */
const commandList = () => supportedCommands().filter((c) => /^[A-Za-z]+$/.test(c));

/**
 * Insert › Equation and the edit form of an equation (D23): a LaTeX field with a live MathML preview, the position
 * (in the line of text or on its own line, numbered or not), the parser's error in the interface language with the
 * command at fault, and the list of commands Thesisfic draws (a click writes the command at the cursor).
 */
export default function EquationDialog({ open, onClose, initial, onSubmit }: EquationDialogProps) {
  const t = useT();
  const editing = !!initial;
  const [latex, setLatex] = useState(initial?.latex ?? "");
  const [display, setDisplay] = useState(initial?.display ?? true);
  const [numbered, setNumbered] = useState(!!initial?.numbered);
  const [filter, setFilter] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setLatex(initial?.latex ?? "");
    setDisplay(initial?.display ?? true);
    setNumbered(!!initial?.numbered);
    setFilter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = latex.trim();
  const result = useMemo(() => (trimmed ? latexToMathML(trimmed, { display }) : null), [trimmed, display]);
  const commands = useMemo(commandList, []);
  const shown = useMemo(() => {
    const q = filter.trim().replace(/^\\/, "").toLowerCase();
    return q ? commands.filter((c) => c.toLowerCase().includes(q)) : commands;
  }, [commands, filter]);

  const insertCommand = (cmd: string) => {
    const el = areaRef.current;
    const text = `\\${cmd}${/^(frac|dfrac|tfrac|binom)$/.test(cmd) ? "{}{}" : /^(sqrt|hat|bar|tilde|vec|dot|ddot|overline|widehat|widetilde|mathrm|mathbf|mathit|mathbb|text|operatorname)$/.test(cmd) ? "{}" : " "}`;
    const start = el ? el.selectionStart : latex.length;
    const end = el ? el.selectionEnd : latex.length;
    const next = (latex.slice(0, start) + text + latex.slice(end)).slice(0, MAX_LATEX_LENGTH);
    setLatex(next);
    // The caret lands inside the first braces, or after the space that ends the command.
    const caret = start + cmd.length + 2;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const canSubmit = !!result && result.ok;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ latex: trimmed, display, numbered: display && numbered });
  };

  const origin = initial?.origin === "ai" ? t("figures.eq.keepsAi") : t("figures.eq.counted");
  const fieldId = "equation-latex";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("figures.eq.titleEdit") : t("figures.eq.titleNew")}
      size="lg"
      footer={
        <div className="w-full flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-gray-600 sm:flex-1">{origin}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
              {t("common.cancel")}
            </button>
            <button type="button" disabled={!canSubmit} onClick={submit} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">
              {editing ? t("figures.eq.save") : t("editor.insert")}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={fieldId} className="block text-[13px] font-medium text-gray-700 mb-1">
            {t("figures.eq.latex")}
          </label>
          <textarea
            id={fieldId}
            ref={areaRef}
            autoFocus
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={MAX_LATEX_LENGTH}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("figures.eq.placeholder")}
            aria-describedby="equation-status"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[13px] leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white"
          />
        </div>

        {!editing && (
          <fieldset>
            <legend className="text-[13px] font-medium text-gray-700 mb-1">{t("figures.eq.layout")}</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { v: false, label: t("figures.eq.inline") },
                { v: true, label: t("figures.eq.block") },
              ].map((o) => (
                <label key={String(o.v)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] cursor-pointer ${display === o.v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                  <input type="radio" name="equation-layout" className="accent-brand-600" checked={display === o.v} onChange={() => setDisplay(o.v)} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {display && (
          <label className="flex items-center gap-2 text-[13px] text-gray-700">
            <input type="checkbox" className="accent-brand-600" checked={numbered} onChange={(e) => setNumbered(e.target.checked)} />
            {t("figures.eq.numbered")}
          </label>
        )}

        <div>
          <div className="text-[13px] font-medium text-gray-700 mb-1">{t("figures.eq.preview")}</div>
          <div className="eq-preview rounded-xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] flex items-center justify-center overflow-x-auto">
            {result && result.ok ? (
              <div className={display ? "w-full text-center text-[20px]" : "text-[20px]"} dangerouslySetInnerHTML={{ __html: result.mathml }} />
            ) : (
              <span className="text-[13px] text-gray-500">{t("figures.eq.previewEmpty")}</span>
            )}
          </div>
          <div id="equation-status" role="status" aria-live="polite" className="min-h-[20px] mt-1.5">
            {result && !result.ok && <p className="text-[13px] text-red-600">{latexErrorMessage(result.error, t)}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200">
          <button type="button" onClick={() => setHelpOpen((v) => !v)} aria-expanded={helpOpen} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-[13px] font-medium text-gray-700 rounded-xl hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40">
            {t("figures.eq.help")}
            <ChevronDown size={16} className={`transition-transform ${helpOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {helpOpen && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-xs text-gray-600">{t("figures.eq.helpIntro", { list: supportedEnvironments().join(", ") })}</p>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("figures.eq.helpFilter")} aria-label={t("figures.eq.helpFilter")} className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
              <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1">
                {shown.length ? (
                  shown.map((c) => (
                    <button key={c} type="button" onClick={() => insertCommand(c)} className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[12px] text-gray-700 hover:bg-brand-50 hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40">
                      \{c}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">{t("figures.eq.helpNone")}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
