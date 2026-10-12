// Thesis structure: real footnotes, an automatic table of contents and numbered captions.
//
// - Footnotes: an inline `footnoteRef` marker (a superscript number) and a `footnotes` section at the very end of
//   the document holding one `footnote` block per marker, in marker order. A plugin keeps the two in sync on every
//   change: deleting a marker removes its note, pasting a marker gets a fresh note, the section always stays last,
//   and the numbers (CSS counters, see globals.css) follow document order. Clicking a marker jumps to its note.
// - Table of contents: a `toc` block drawn from the live headings (levels 2-4, with the heading numbers when
//   numbering is on and the page each heading starts on, read from the visual pagination). It redraws itself and is
//   never typed into; exports rebuild it from the headings.
// - Captions: a paragraph attribute `caption="table"` for a table title, numbered "Table n." by CSS counters, like the
//   figure captions get "Figure n.". The labels are localised through the `--cap-figure` / `--cap-table` variables.
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    thesisBlocks: {
      /** Inserts a footnote marker at the caret, its note at the end, and moves the caret into the note. */
      insertFootnote: () => ReturnType;
      /** Inserts (or replaces) the automatic table of contents at the caret. */
      insertToc: () => ReturnType;
      /** Adds a numbered caption paragraph above the table the caret is in. */
      setTableCaption: () => ReturnType;
    };
  }
}

const uid = () => `fn${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- Footnotes ----------

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: { default: null, parseHTML: (el) => el.getAttribute("data-footnote-ref"), renderHTML: (a) => ({ "data-footnote-ref": a.id }) } };
  },
  parseHTML() {
    // Above the Superscript mark's own `sup` rule (default priority 50), which would otherwise swallow the marker.
    return [{ tag: "sup[data-footnote-ref]", priority: 100 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "fn-ref", contenteditable: "false" })];
  },
});

export const Footnote = Node.create({
  name: "footnote",
  content: "paragraph+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { id: { default: null, parseHTML: (el) => el.getAttribute("data-footnote"), renderHTML: (a) => ({ "data-footnote": a.id }) } };
  },
  parseHTML() {
    return [{ tag: "div[data-footnote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "fn-item" }), 0];
  },
});

interface RefInfo { id: string; pos: number }
interface NoteInfo { id: string; node: PMNode; pos: number }

function scan(doc: PMNode) {
  const refs: RefInfo[] = [];
  let section: { pos: number; node: PMNode } | null = null;
  let afterSection = false;
  doc.forEach((child, offset) => {
    if (child.type.name === "footnotes") section = { pos: offset, node: child };
    else if (section) afterSection = true;
  });
  doc.descendants((node, pos) => {
    if (node.type.name === "footnoteRef") refs.push({ id: node.attrs.id, pos });
    if (node.type.name === "footnotes") return false;
    return true;
  });
  const notes: NoteInfo[] = [];
  const sec = section as { pos: number; node: PMNode } | null;
  if (sec) sec.node.forEach((n, off) => notes.push({ id: n.attrs.id, node: n, pos: sec.pos + 1 + off }));
  return { refs, section: sec, notes, afterSection };
}

/** Rebuilds the footnotes section so that it lists one note per marker, in marker order, as the last block. Returns
 *  the transaction when something changed, null otherwise. */
function syncFootnotes(tr: Transaction, schema: PMNode["type"]["schema"]): Transaction | null {
  const { refs, section, notes, afterSection } = scan(tr.doc);
  const noteType = schema.nodes.footnote;
  const sectionType = schema.nodes.footnotes;
  // Duplicate marker ids (a pasted marker) get fresh ids so each marker owns one note.
  const seen = new Set<string>();
  let changed = false;
  for (const r of refs) {
    if (!r.id || seen.has(r.id)) {
      const id = uid();
      tr.setNodeMarkup(r.pos, undefined, { id });
      r.id = id;
      changed = true;
    }
    seen.add(r.id);
  }
  if (!refs.length) {
    if (section) { tr.delete(section.pos, section.pos + section.node.nodeSize); return tr; }
    return changed ? tr : null;
  }
  const byId = new Map(notes.map((n) => [n.id, n.node]));
  const wanted = refs.map((r) => byId.get(r.id) || noteType.create({ id: r.id }, schema.nodes.paragraph.create()));
  const same = section && !afterSection && notes.length === wanted.length && notes.every((n, i) => n.node === wanted[i]);
  if (same) return changed ? tr : null;
  const fresh = sectionType.create(null, wanted);
  if (section) tr.delete(section.pos, section.pos + section.node.nodeSize);
  tr.insert(tr.doc.content.size, fresh);
  return tr;
}

export const Footnotes = Node.create({
  name: "footnotes",
  group: "block",
  content: "footnote+",
  isolating: true,
  defining: true,
  selectable: false,
  parseHTML() {
    return [{ tag: "section[data-footnotes]" }];
  },
  renderHTML() {
    return ["section", { "data-footnotes": "true", class: "footnotes" }, 0];
  },
  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ state, tr, dispatch }) => {
          const { schema } = state;
          const id = uid();
          const ref = schema.nodes.footnoteRef.create({ id });
          tr.replaceSelectionWith(ref, false);
          // Place the note among the existing ones, in marker order.
          const { refs, section, notes } = scan(tr.doc);
          const index = refs.findIndex((r) => r.id === id);
          const note = schema.nodes.footnote.create({ id }, schema.nodes.paragraph.create());
          let notePos: number;
          if (!section) {
            notePos = tr.doc.content.size + 1;
            tr.insert(tr.doc.content.size, schema.nodes.footnotes.create(null, [note]));
          } else {
            const before = notes.filter((n) => refs.findIndex((r) => r.id === n.id) < index && refs.some((r) => r.id === n.id));
            notePos = before.length ? before[before.length - 1].pos + before[before.length - 1].node.nodeSize : section.pos + 1;
            tr.insert(notePos, note);
          }
          if (dispatch) {
            tr.setSelection(TextSelection.create(tr.doc, notePos + 2));
            tr.scrollIntoView();
          }
          return true;
        },
    };
  },
  onCreate() {
    // A document saved with notes but no markers (or the other way round) is repaired once, on load.
    const tr = syncFootnotes(this.editor.state.tr, this.editor.state.schema);
    if (tr && tr.docChanged) this.editor.view.dispatch(tr);
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("thesisficFootnotes"),
        appendTransaction: (transactions, _old, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = syncFootnotes(newState.tr, newState.schema);
          return tr && tr.docChanged ? tr : null;
        },
        props: {
          handleClickOn: (view, _pos, node) => {
            if (node.type.name !== "footnoteRef") return false;
            const { notes } = scan(view.state.doc);
            const target = notes.find((n) => n.id === node.attrs.id);
            if (!target) return false;
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target.pos + 2)).scrollIntoView());
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Alt-f": () => this.editor.commands.insertFootnote(),
      // Escape inside a note: back to its marker.
      Escape: () => {
        const { state } = this.editor;
        const $from = state.selection.$from;
        for (let d = $from.depth; d > 0; d--) {
          const n = $from.node(d);
          if (n.type.name === "footnote") {
            const { refs } = scan(state.doc);
            const r = refs.find((x) => x.id === n.attrs.id);
            if (!r) return false;
            this.editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, r.pos + 1)).scrollIntoView());
            return true;
          }
        }
        return false;
      },
    };
  },
});

/** Footnote order and numbers of a document: used by the exports. */
export function footnoteOrder(html: string): string[] {
  const ids: string[] = [];
  const re = /<sup[^>]*data-footnote-ref="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids.push(m[1]);
  return ids;
}

// ---------- Table of contents ----------

export interface TocLabels { title: string; empty: string }

interface TocEntry { level: number; text: string; number: string; page: number | null; pos: number }

/** Headings 2-4 with their running numbers (1 / 1.1 / 1.1.1, as the heading numbering shows them). */
export function tocEntries(editor: Editor): TocEntry[] {
  const out: TocEntry[] = [];
  const counters = [0, 0, 0];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "footnotes" || node.type.name === "toc") return false;
    if (node.type.name !== "heading") return true;
    const level = Number(node.attrs.level);
    if (level < 2 || level > 4) return false;
    counters[level - 2] += 1;
    for (let i = level - 1; i < counters.length; i++) counters[i] = 0;
    const number = counters.slice(0, level - 1).join(".") + (level === 2 ? "." : "");
    out.push({ level, text: node.textContent.trim(), number, page: null, pos });
    return false;
  });
  // Page numbers come from the visual pagination: a heading is on page 1 + the number of page gaps before it.
  const root = editor.view.dom;
  const gaps = Array.from(root.querySelectorAll(".page-gap"));
  if (gaps.length && window.innerWidth >= 768) {
    for (const e of out) {
      const dom = editor.view.nodeDOM(e.pos) as HTMLElement | null;
      if (!dom) continue;
      let n = 0;
      for (const g of gaps) if (g.compareDocumentPosition(dom) & 4) n++; // 4 = DOCUMENT_POSITION_FOLLOWING (the DOM Node global is shadowed by TipTap's Node here)
      e.page = n + 1;
    }
  } else if (window.innerWidth >= 768) {
    for (const e of out) e.page = 1;
  }
  return out;
}

export const Toc = Node.create<{ labels: TocLabels }>({
  name: "toc",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { labels: { title: "Table of Contents", empty: "(no headings yet)" } };
  },
  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },
  renderHTML() {
    return ["nav", { "data-toc": "true", class: "toc", contenteditable: "false" }];
  },
  addCommands() {
    return {
      insertToc:
        () =>
        ({ chain, state }) => {
          // One table of contents per document: inserting again moves it to the caret.
          let existing: number | null = null;
          state.doc.descendants((n, pos) => { if (n.type.name === "toc") { existing = pos; return false; } return true; });
          const c = chain();
          if (existing !== null) c.deleteRange({ from: existing, to: existing + 1 });
          return c.insertContent({ type: this.name }).createParagraphNear().run();
        },
    };
  },
  addNodeView() {
    const labels = this.options.labels;
    return ({ editor }) => {
      const dom = document.createElement("nav");
      dom.className = "toc";
      dom.setAttribute("data-toc", "true");
      dom.contentEditable = "false";
      let timer: ReturnType<typeof setTimeout> | null = null;
      const render = () => {
        timer = null;
        if (!dom.isConnected) return;
        const numbered = !!editor.view.dom.closest(".docs-page")?.classList.contains("num-headings");
        const entries = tocEntries(editor);
        dom.innerHTML = "";
        const h = document.createElement("div");
        h.className = "toc-title";
        h.textContent = labels.title;
        dom.appendChild(h);
        if (!entries.length) {
          const p = document.createElement("div");
          p.className = "toc-empty";
          p.textContent = labels.empty;
          dom.appendChild(p);
          return;
        }
        const list = document.createElement("ol");
        for (const e of entries) {
          const li = document.createElement("li");
          li.className = `toc-l${e.level}`;
          const a = document.createElement("a");
          a.href = "#";
          a.className = "toc-entry";
          const label = document.createElement("span");
          label.className = "toc-text";
          label.textContent = (numbered ? `${e.number}  ` : "") + (e.text || "…");
          a.appendChild(label);
          if (e.page) {
            const pg = document.createElement("span");
            pg.className = "toc-page";
            pg.textContent = String(e.page);
            a.appendChild(pg);
          }
          a.addEventListener("mousedown", (ev) => ev.preventDefault());
          a.addEventListener("click", (ev) => {
            ev.preventDefault();
            const target = editor.view.nodeDOM(e.pos) as HTMLElement | null;
            target?.scrollIntoView({ block: "start", behavior: "smooth" });
            editor.commands.setTextSelection(e.pos + 1);
          });
          li.appendChild(a);
          list.appendChild(li);
        }
        dom.appendChild(list);
      };
      const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(render, 250); };
      render();
      editor.on("update", schedule);
      // Pagination widgets arrive after layout; watch the sheet for them.
      const mo = new MutationObserver((muts) => { if (muts.some((m) => Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).some((n) => (n as HTMLElement).classList?.contains("page-gap")))) schedule(); });
      mo.observe(editor.view.dom, { childList: true, subtree: true });
      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: (ev) => ev.type !== "mousedown" || !(ev.target as HTMLElement).closest("a.toc-entry") ? false : true,
        selectNode: () => dom.classList.add("ProseMirror-selectednode"),
        deselectNode: () => dom.classList.remove("ProseMirror-selectednode"),
        destroy: () => { editor.off("update", schedule); mo.disconnect(); if (timer) clearTimeout(timer); },
      };
    };
  },
});

/** Static HTML list for the exports (numbers follow the same rule as on screen; no page numbers). */
export function tocHtml(html: string, labels: TocLabels, numbered: boolean): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const counters = [0, 0, 0];
  const items: string[] = [];
  doc.querySelectorAll("h2, h3, h4").forEach((h) => {
    if (h.closest("[data-footnotes]")) return;
    const level = Number(h.tagName.slice(1));
    counters[level - 2] += 1;
    for (let i = level - 1; i < counters.length; i++) counters[i] = 0;
    const number = counters.slice(0, level - 1).join(".") + (level === 2 ? "." : "");
    const text = (h.textContent || "").trim();
    items.push(`<li class="toc-l${level}">${"&nbsp;&nbsp;&nbsp;".repeat(level - 2)}${numbered ? number + " " : ""}${text.replace(/</g, "&lt;")}</li>`);
  });
  return `<nav class="toc" data-toc="true"><div class="toc-title">${labels.title}</div>${items.length ? `<ol>${items.join("")}</ol>` : `<div class="toc-empty">${labels.empty}</div>`}</nav>`;
}

// ---------- Captions ----------

export const Captions = Extension.create({
  name: "captions",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          caption: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-caption"),
            renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption, class: `caption caption-${attrs.caption}` } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setTableCaption:
        () =>
        ({ state, tr, dispatch }) => {
          const $from = state.selection.$from;
          let tablePos: number | null = null;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "table") { tablePos = $from.before(d); break; }
          }
          if (tablePos === null) return false;
          // An existing caption right above the table just takes the caret.
          const $t = state.doc.resolve(tablePos);
          const prev = $t.nodeBefore;
          if (prev && prev.type.name === "paragraph" && prev.attrs.caption === "table") {
            if (dispatch) tr.setSelection(TextSelection.create(state.doc, tablePos - 1)).scrollIntoView();
            return true;
          }
          const para = state.schema.nodes.paragraph.create({ caption: "table", textAlign: "center" });
          tr.insert(tablePos, para);
          if (dispatch) tr.setSelection(TextSelection.create(tr.doc, tablePos + 1)).scrollIntoView();
          return true;
        },
    };
  },
});

export const ThesisBlocks = [FootnoteRef, Footnote, Footnotes, Captions];
