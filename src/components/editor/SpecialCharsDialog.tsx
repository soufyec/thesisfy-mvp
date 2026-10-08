"use client";

import { useMemo, useState } from "react";
import { Modal } from "../ui";
import { useT } from "@/lib/i18n/client";

type Cat = "arrows" | "math" | "greek" | "punctuation" | "symbols";

/** [character, search keywords]. Keywords are a search aid only (never shown); the code point is matched too. */
const CHARS: Record<Cat, [string, string][]> = {
  arrows: [["←", "left arrow izquierda gauche"], ["→", "right arrow derecha droite"], ["↑", "up arrow arriba haut"], ["↓", "down arrow abajo bas"], ["↔", "left right arrow"], ["↕", "up down arrow"], ["⇐", "double left arrow"], ["⇒", "double right arrow implies implica"], ["⇔", "double left right arrow iff equivalent"], ["↗", "north east arrow"], ["↘", "south east arrow"], ["↙", "south west arrow"], ["↖", "north west arrow"], ["↩", "return arrow"], ["↪", "right hook arrow"], ["↦", "maps to"], ["↺", "anticlockwise arrow"], ["↻", "clockwise arrow"], ["⟵", "long left arrow"], ["⟶", "long right arrow"], ["⟷", "long left right arrow"], ["↠", "two headed arrow"], ["⇄", "right left arrows"], ["➔", "heavy arrow"]],
  math: [["±", "plus minus"], ["×", "times multiply por"], ["÷", "divide dividir"], ["≠", "not equal distinto"], ["≈", "approximately almost equal"], ["≡", "identical equivalent"], ["≤", "less than or equal"], ["≥", "greater than or equal"], ["≪", "much less"], ["≫", "much greater"], ["∞", "infinity infinito"], ["√", "square root raiz"], ["∑", "sum sumatorio"], ["∏", "product producto"], ["∫", "integral"], ["∂", "partial derivative"], ["∆", "delta increment"], ["∇", "nabla gradient"], ["∈", "element of pertenece"], ["∉", "not element of"], ["∪", "union"], ["∩", "intersection interseccion"], ["⊂", "subset"], ["⊃", "superset"], ["⊆", "subset or equal"], ["⊇", "superset or equal"], ["∅", "empty set vacio"], ["∀", "for all"], ["∃", "there exists"], ["¬", "not negation"], ["∧", "and logical"], ["∨", "or logical"], ["∴", "therefore"], ["∵", "because"], ["∝", "proportional"], ["°", "degree grado"], ["′", "prime minute"], ["″", "double prime second"], ["‰", "per mille"], ["½", "one half"], ["⅓", "one third"], ["¼", "one quarter"], ["¾", "three quarters"], ["²", "squared superscript two"], ["³", "cubed superscript three"], ["¹", "superscript one"], ["ⁿ", "superscript n"], ["₀", "subscript zero"], ["₁", "subscript one"], ["₂", "subscript two"], ["µ", "micro"]],
  greek: [["α", "alpha alfa"], ["β", "beta"], ["γ", "gamma"], ["δ", "delta"], ["ε", "epsilon"], ["ζ", "zeta"], ["η", "eta"], ["θ", "theta"], ["ι", "iota"], ["κ", "kappa"], ["λ", "lambda"], ["μ", "mu"], ["ν", "nu"], ["ξ", "xi"], ["ο", "omicron"], ["π", "pi"], ["ρ", "rho"], ["σ", "sigma"], ["ς", "final sigma"], ["τ", "tau"], ["υ", "upsilon"], ["φ", "phi"], ["χ", "chi"], ["ψ", "psi"], ["ω", "omega"], ["Γ", "capital gamma"], ["Δ", "capital delta"], ["Θ", "capital theta"], ["Λ", "capital lambda"], ["Ξ", "capital xi"], ["Π", "capital pi"], ["Σ", "capital sigma"], ["Φ", "capital phi"], ["Ψ", "capital psi"], ["Ω", "capital omega ohm"]],
  punctuation: [["–", "en dash guion"], ["—", "em dash raya"], ["‐", "hyphen"], ["‑", "non breaking hyphen"], ["…", "ellipsis puntos suspensivos"], ["«", "left guillemet comillas angulares"], ["»", "right guillemet comillas angulares"], ["‹", "single left guillemet"], ["›", "single right guillemet"], ["“", "left double quote comillas"], ["”", "right double quote comillas"], ["‘", "left single quote"], ["’", "right single quote apostrophe apostrofo"], ["„", "low double quote"], ["‚", "low single quote"], ["¿", "inverted question mark"], ["¡", "inverted exclamation mark"], ["§", "section sign seccion"], ["¶", "pilcrow paragraph parrafo"], ["†", "dagger"], ["‡", "double dagger"], ["•", "bullet vineta"], ["·", "middle dot punto medio"], ["‣", "triangular bullet"], ["※", "reference mark"], ["‽", "interrobang"], [" ", "non breaking space espacio duro"], [" ", "thin space espacio fino"]],
  symbols: [["©", "copyright"], ["®", "registered"], ["™", "trademark marca"], ["€", "euro"], ["£", "pound libra"], ["¥", "yen"], ["¢", "cent"], ["$", "dollar dolar"], ["₹", "rupee"], ["№", "numero number sign"], ["✓", "check mark tick"], ["✗", "ballot x cross"], ["★", "black star"], ["☆", "white star"], ["♥", "heart corazon"], ["♦", "diamond"], ["♣", "club"], ["♠", "spade"], ["☐", "empty box checkbox"], ["☑", "checked box"], ["☒", "crossed box"], ["♪", "music note"], ["⚠", "warning"], ["✉", "envelope"], ["☎", "telephone"], ["✂", "scissors"], ["♀", "female"], ["♂", "male"], ["ß", "sharp s eszett"], ["æ", "ae ligature"], ["Æ", "capital ae"], ["œ", "oe ligature"], ["Œ", "capital oe"], ["ø", "o slash"], ["Ø", "capital o slash"], ["ð", "eth"], ["þ", "thorn"], ["ł", "l stroke"], ["§", "section"]],
};

const CATS: Cat[] = ["arrows", "math", "greek", "punctuation", "symbols"];

const hex = (ch: string) => {
  const n = ch.codePointAt ? ch.codePointAt(0) || 0 : ch.charCodeAt(0);
  return n.toString(16).toUpperCase().padStart(4, "0");
};

/** Insert › Special characters: browse by category or search by the character, its name or its code (e.g. "alpha", "03b1"). */
export function SpecialCharsDialog({ open, onClose, onInsert }: { open: boolean; onClose: () => void; onInsert: (ch: string) => void }) {
  const t = useT();
  const [cat, setCat] = useState<Cat | "all">("math");
  const [q, setQ] = useState("");
  const [last, setLast] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = (cat === "all" || needle ? CATS : [cat]).flatMap((c) => CHARS[c]);
    const seen: Record<string, boolean> = {};
    return pool.filter(([ch, kw]) => {
      if (seen[ch]) return false;
      seen[ch] = true;
      return !needle || ch === q.trim() || kw.indexOf(needle) >= 0 || hex(ch).toLowerCase().indexOf(needle.replace(/^u\+/, "")) >= 0;
    });
  }, [cat, q]);
  return (
    <Modal open={open} onClose={onClose} title={t("editor.chars.title")} size="md" footer={<><span className="mr-auto text-xs text-gray-400" aria-live="polite">{last ? t("editor.chars.inserted", { ch: last }) : t("editor.chars.hint")}</span><button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">{t("common.done")}</button></>}>
      <div className="space-y-3">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("editor.chars.search")} aria-label={t("editor.chars.search")} className="input-field !py-2 text-sm" />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("editor.chars.categories")}>
          {(["all", ...CATS] as const).map((c) => (
            <button key={c} role="tab" aria-selected={!q && cat === c} onClick={() => { setCat(c); setQ(""); }} className={`px-2.5 py-1 rounded-full text-[12px] border ${!q && cat === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {t(`editor.chars.cat.${c}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-[260px] overflow-y-auto" role="listbox" aria-label={t("editor.chars.title")}>
          {list.map(([ch]) => (
            <button key={ch} role="option" aria-selected={false} onClick={() => { onInsert(ch); setLast(ch.trim() ? ch : `U+${hex(ch)}`); }} title={`U+${hex(ch)}`} aria-label={`${ch.trim() ? ch : "U+" + hex(ch)} (U+${hex(ch)})`} className="h-9 rounded-lg border border-gray-100 text-[17px] text-gray-800 hover:bg-brand-50 hover:border-brand-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
              {ch.trim() ? ch : <span className="text-[10px] text-gray-400">SP</span>}
            </button>
          ))}
          {!list.length && <div className="col-span-full py-6 text-center text-sm text-gray-400">{t("editor.chars.none")}</div>}
        </div>
      </div>
    </Modal>
  );
}
