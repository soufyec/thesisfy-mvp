import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export type CaseMode = "upper" | "lower" | "title";
export type IndentMode = "first" | "hanging" | null;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textTools: {
      /** Changes the case of the selected text; marks (including provenance) are kept as they are. */
      changeCase: (mode: CaseMode) => ReturnType;
      /** UPPER → lower → Title, by what the selection is now (the Shift+F3 behaviour). */
      cycleCase: () => ReturnType;
      /** First-line or hanging indent (1.27 cm) on the paragraphs of the selection; null removes it. */
      setIndentMode: (mode: IndentMode) => ReturnType;
      /** Removes formatting marks (bold, colour, size…) but keeps provenance, comments, citations and links. */
      clearFormatting: () => ReturnType;
    };
  }
}

/** Marks that are records, not looks: "Clear formatting" never removes them (an AI-assisted passage stays attributed). */
const KEEP_MARKS = ["provenance", "commentMark", "citation", "citedPassage", "link"];

const WORD_CHAR = /[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ'’]/;

function convert(text: string, mode: CaseMode, prev: string): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  let out = "";
  let before = prev;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    out += before && WORD_CHAR.test(before) ? ch.toLowerCase() : ch.toUpperCase();
    before = ch;
  }
  return out;
}

export const TextTools = Extension.create({
  name: "textTools",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indentMode: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-indent-mode") || null,
            renderHTML: (attrs) =>
              attrs.indentMode === "first"
                ? { "data-indent-mode": "first", style: "text-indent: 1.27cm" }
                : attrs.indentMode === "hanging"
                  ? { "data-indent-mode": "hanging", style: "padding-left: 1.27cm; text-indent: -1.27cm" }
                  : {},
          },
        },
      },
    ];
  },
  addCommands() {
    const apply =
      (mode: CaseMode) =>
      ({ state, dispatch }: { state: import("@tiptap/pm/state").EditorState; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
        const { from, to, empty } = state.selection;
        if (empty) return false;
        const ranges: { from: number; to: number; text: string; marks: readonly import("@tiptap/pm/model").Mark[]; prev: string }[] = [];
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isText || !node.text) return;
          const s = Math.max(from, pos);
          const e = Math.min(to, pos + node.nodeSize);
          if (e <= s) return;
          ranges.push({ from: s, to: e, text: node.text.slice(s - pos, e - pos), marks: node.marks, prev: s > 0 ? state.doc.textBetween(s - 1, s, " ", " ") : "" });
        });
        const changes = ranges.filter((r) => convert(r.text, mode, r.prev) !== r.text);
        if (!changes.length) return false;
        if (dispatch) {
          const tr = state.tr;
          for (let i = changes.length - 1; i >= 0; i--) {
            const r = changes[i];
            tr.replaceWith(r.from, r.to, state.schema.text(convert(r.text, mode, r.prev), r.marks));
          }
          tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from), tr.mapping.map(to)));
          dispatch(tr);
        }
        return true;
      };
    return {
      changeCase: (mode) => (props) => apply(mode)(props),
      cycleCase: () => (props) => {
        const { from, to, empty } = props.state.selection;
        if (empty) return false;
        const text = props.state.doc.textBetween(from, to, " ");
        const next: CaseMode = text === text.toUpperCase() && text !== text.toLowerCase() ? "lower" : text === text.toLowerCase() ? "title" : "upper";
        return apply(next)(props);
      },
      clearFormatting:
        () =>
        ({ state, tr, dispatch }) => {
          const keep = KEEP_MARKS;
          const { from, to, empty, $from } = state.selection;
          if (!dispatch) return true;
          if (empty) {
            tr.setStoredMarks((tr.storedMarks || $from.marks()).filter((m) => keep.indexOf(m.type.name) >= 0));
            return true;
          }
          Object.keys(state.schema.marks).forEach((name) => {
            if (keep.indexOf(name) < 0) tr.removeMark(from, to, state.schema.marks[name]);
          });
          return true;
        },
      setIndentMode:
        (mode) =>
        ({ commands }) =>
          ["paragraph", "heading"].every((t) => commands.updateAttributes(t, { indentMode: mode })),
    };
  },
});
