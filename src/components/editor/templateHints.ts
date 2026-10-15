import { Extension, type Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { Translate } from "@/lib/i18n/dictionary";

/**
 * Template hints (docs/papers.md D3, §4.4). A template writes only headings; under each h2 it leaves an empty
 * paragraph with `data-hint="papers.hint.x"`. The hint is a placeholder drawn by the Placeholder decoration in the
 * viewer's interface language: it is not text, so it never counts as words, never reaches an export (export.ts
 * `bakeStructure` drops `data-hint`) and never shows in review mode or on a locked paper (decorations are drawn only
 * while the editor is editable). As soon as the paragraph holds anything, the hint attribute is removed for good.
 *
 * CSS: `.ProseMirror p.is-empty[data-hint]::before` in globals.css draws `attr(data-placeholder)`.
 */

/** Only the template's own keys are accepted, so a hand-made `data-hint` can never show arbitrary text. */
const HINT_KEY_RE = /^papers\.hint\.[A-Za-z0-9_]{1,60}$/;

export const readHint = (value: unknown): string | null => (typeof value === "string" && HINT_KEY_RE.test(value) ? value : null);

/** Global `hint` attribute on paragraphs (`data-hint`), kept off new paragraphs split from it, plus its clean-up. */
export const TemplateHints = Extension.create({
  name: "templateHints",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          hint: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => readHint(el.getAttribute("data-hint")),
            renderHTML: (attrs: Record<string, unknown>) => {
              const hint = readHint(attrs.hint);
              return hint ? { "data-hint": hint } : {};
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("thesisficTemplateHints"),
        // A hint belongs to an empty paragraph only: once the student writes there (or pastes, or inserts), it goes.
        // The removal is appended to the same change, so undo brings the hint back with the empty paragraph.
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((tr) => tr.docChanged)) return null;
          let out: Transaction | null = null;
          state.doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name !== "paragraph") return !node.isTextblock && !node.isAtom;
            if (node.attrs.hint && node.content.size > 0) {
              out = out || state.tr;
              out.setNodeMarkup(pos, undefined, { ...node.attrs, hint: null });
            }
            return false;
          });
          return out;
        },
      }),
    ];
  },
});

/**
 * Placeholder decorations for every empty top-level block (not only the one with the cursor): a paragraph with a
 * template hint shows the hint, the first paragraph of an empty document shows `editor.placeholder`, any other empty
 * block shows nothing. `translate` is read at decoration time, so a language change (LanguageSwitcher) is picked up
 * by the next redraw (the shell dispatches a no-op transaction when the locale changes).
 */
export function hintPlaceholder(translate: () => Translate) {
  return Placeholder.configure({
    showOnlyCurrent: false,
    includeChildren: false,
    placeholder: ({ editor, node, pos }: { editor: Editor; node: PMNode; pos: number; hasAnchor: boolean }) => {
      const hint = node.type.name === "paragraph" ? readHint(node.attrs.hint) : null;
      if (hint) return translate()(hint);
      if (pos === 0 && editor.isEmpty) return translate()("editor.placeholder");
      return "";
    },
  });
}
