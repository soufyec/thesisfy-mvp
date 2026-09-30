import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import "@tiptap/extension-text-style";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    provenance: {
      setProvenance: (attrs: { source: "ai" | "paste"; provider?: string; label?: string; interactionId?: string }) => ReturnType;
      unsetProvenance: () => ReturnType;
    };
    commentMark: {
      setComment: (id: string) => ReturnType;
      unsetComment: (id: string) => ReturnType;
    };
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    lineHeight: {
      setLineHeight: (value: string) => ReturnType;
    };
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
    search: {
      setSearchTerm: (term: string, replaceTerm?: string, caseSensitive?: boolean) => ReturnType;
      nextSearchResult: () => ReturnType;
      prevSearchResult: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

/**
 * Provenance: text inserted from the AI assistant or pasted from outside carries a mark with its origin.
 * The mark is not inclusive, so text the student types right after it stays attributed to them.
 */
export const Provenance = Mark.create({
  name: "provenance",
  inclusive: false,
  keepOnSplit: false,
  addAttributes() {
    return {
      source: { default: "ai", parseHTML: (el) => el.getAttribute("data-provenance"), renderHTML: (a) => ({ "data-provenance": a.source }) },
      provider: { default: null, parseHTML: (el) => el.getAttribute("data-provider"), renderHTML: (a) => (a.provider ? { "data-provider": a.provider } : {}) },
      label: { default: null, parseHTML: (el) => el.getAttribute("data-source"), renderHTML: (a) => (a.label ? { "data-source": a.label } : {}) },
      interactionId: { default: null, parseHTML: (el) => el.getAttribute("data-interaction"), renderHTML: (a) => (a.interactionId ? { "data-interaction": a.interactionId } : {}) },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-provenance]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: `prov prov-${HTMLAttributes["data-provenance"]}` }), 0];
  },
  addCommands() {
    return {
      setProvenance:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetProvenance:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

export const CommentMark = Mark.create({
  name: "commentMark",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return { id: { default: null, parseHTML: (el) => el.getAttribute("data-comment-id"), renderHTML: (a) => ({ "data-comment-id": a.id }) } };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "thesisfy-comment" }), 0];
  },
  addCommands() {
    return {
      setComment:
        (id) =>
        ({ commands }) =>
          commands.setMark(this.name, { id }),
      unsetComment:
        (id) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.marks[this.name];
          state.doc.descendants((node, pos) => {
            node.marks.forEach((m) => {
              if (m.type === type && m.attrs.id === id) tr.removeMark(pos, pos + node.nodeSize, m);
            });
          });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const LineHeight = Extension.create({
  name: "lineHeight",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight:
        (value) =>
        ({ commands }) =>
          ["paragraph", "heading"].every((t) => commands.updateAttributes(t, { lineHeight: value })),
    };
  },
});

export const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute("data-indent") || 0),
            renderHTML: (attrs) => (attrs.indent ? { "data-indent": attrs.indent, style: `margin-left: ${attrs.indent * 2}em` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    const change = (delta: number) =>
      ({ tr, state, dispatch, commands }: { tr: import("@tiptap/pm/state").Transaction; state: import("@tiptap/pm/state").EditorState; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void; commands: import("@tiptap/core").SingleCommands }) => {
        // inside lists, defer to list indentation
        if (state.selection.$from.node(-1)?.type.name === "listItem" || state.selection.$from.node(-1)?.type.name === "taskItem") {
          return delta > 0 ? commands.sinkListItem("listItem") || commands.sinkListItem("taskItem") : commands.liftListItem("listItem") || commands.liftListItem("taskItem");
        }
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === "paragraph" || node.type.name === "heading") {
            const next = Math.max(0, Math.min(8, (node.attrs.indent || 0) + delta));
            if (next !== node.attrs.indent) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    return { indent: () => change(1), outdent: () => change(-1) };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      "Shift-Tab": () => this.editor.commands.outdent(),
    };
  },
});

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML() {
    return ["div", { "data-page-break": "true", class: "page-break", contenteditable: "false" }, ["span", { class: "page-break-label" }, "Page break"]];
  },
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).createParagraphNear().run(),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Enter": () => this.editor.commands.setPageBreak() };
  },
});

// ---------- Find & replace ----------

const searchKey = new PluginKey("thesisfySearch");

interface SearchState {
  term: string;
  replace: string;
  caseSensitive: boolean;
  results: { from: number; to: number }[];
  index: number;
}

function findResults(doc: import("@tiptap/pm/model").Node, term: string, caseSensitive: boolean) {
  const results: { from: number; to: number }[] = [];
  if (!term) return results;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + term.length });
      idx = hay.indexOf(needle, idx + Math.max(1, needle.length));
    }
  });
  return results;
}

export const Search = Extension.create({
  name: "search",
  addStorage() {
    return { term: "", replace: "", caseSensitive: false, results: [] as { from: number; to: number }[], index: 0 };
  },
  addCommands() {
    const refresh = (editor: import("@tiptap/core").Editor) => {
      const s = editor.storage.search as SearchState;
      s.results = findResults(editor.state.doc, s.term, s.caseSensitive);
      if (s.index >= s.results.length) s.index = 0;
      editor.view.dispatch(editor.state.tr.setMeta(searchKey, { ...s }));
    };
    const goTo = (editor: import("@tiptap/core").Editor) => {
      const s = editor.storage.search as SearchState;
      const r = s.results[s.index];
      if (!r) return;
      editor.commands.setTextSelection(r);
      const dom = editor.view.domAtPos(r.from).node as HTMLElement | Text;
      const el = dom instanceof HTMLElement ? dom : dom.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    return {
      setSearchTerm:
        (term, replace = "", caseSensitive = false) =>
        ({ editor }) => {
          const s = editor.storage.search as SearchState;
          s.term = term;
          s.replace = replace;
          s.caseSensitive = caseSensitive;
          s.index = 0;
          refresh(editor);
          return true;
        },
      nextSearchResult:
        () =>
        ({ editor }) => {
          const s = editor.storage.search as SearchState;
          if (!s.results.length) return false;
          s.index = (s.index + 1) % s.results.length;
          refresh(editor);
          goTo(editor);
          return true;
        },
      prevSearchResult:
        () =>
        ({ editor }) => {
          const s = editor.storage.search as SearchState;
          if (!s.results.length) return false;
          s.index = (s.index - 1 + s.results.length) % s.results.length;
          refresh(editor);
          goTo(editor);
          return true;
        },
      replaceCurrent:
        () =>
        ({ editor, tr, dispatch }) => {
          const s = editor.storage.search as SearchState;
          const r = s.results[s.index];
          if (!r) return false;
          tr.insertText(s.replace, r.from, r.to);
          if (dispatch) dispatch(tr);
          setTimeout(() => refresh(editor), 0);
          return true;
        },
      replaceAll:
        () =>
        ({ editor, tr, dispatch }) => {
          const s = editor.storage.search as SearchState;
          if (!s.results.length) return false;
          [...s.results].reverse().forEach((r) => tr.insertText(s.replace, r.from, r.to));
          if (dispatch) dispatch(tr);
          setTimeout(() => refresh(editor), 0);
          return true;
        },
      clearSearch:
        () =>
        ({ editor }) => {
          const s = editor.storage.search as SearchState;
          s.term = "";
          s.results = [];
          s.index = 0;
          refresh(editor);
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old, _oldState, newState) => {
            const meta = tr.getMeta(searchKey) as SearchState | undefined;
            const storage = this.storage as SearchState;
            if (!meta && !tr.docChanged) return old;
            if (tr.docChanged && storage.term) storage.results = findResults(newState.doc, storage.term, storage.caseSensitive);
            const s = meta || storage;
            if (!s.term) return DecorationSet.empty;
            const decos = s.results.map((r, i) => Decoration.inline(r.from, r.to, { class: i === s.index ? "search-hit search-hit-current" : "search-hit" }));
            return DecorationSet.create(newState.doc, decos);
          },
        },
        props: { decorations: (state) => searchKey.getState(state) },
      }),
    ];
  },
});
