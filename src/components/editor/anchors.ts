import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (name: string) => ReturnType;
    };
  }
}

/** DOM id (and `#` link target) of a bookmark: `bm-` + the name with spaces turned into dashes. */
export function bookmarkId(name: string): string {
  return `bm-${name.trim().replace(/\s+/g, "-").replace(/[^\w\-À-ɏ]/g, "")}`;
}

/**
 * Bookmark: a named point in the text, drawn as a small ribbon. It carries no text and no provenance: it is an anchor
 * for internal links (`#bm-name`), nothing else.
 */
export const Bookmark = Node.create({
  name: "bookmark",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-bookmark") || "",
        renderHTML: (attrs) => ({ "data-bookmark": attrs.name }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-bookmark]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { id: bookmarkId(String(node.attrs.name)), class: "doc-bookmark", contenteditable: "false", title: String(node.attrs.name) })];
  },
  addCommands() {
    return {
      setBookmark:
        (name) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs: { name } }).run(),
    };
  },
});

/** Headings can be link targets: the id is only written when a link to the heading is created. */
export const HeadingAnchors = Extension.create({
  name: "headingAnchors",
  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          anchorId: {
            default: null,
            parseHTML: (el) => el.getAttribute("id") || null,
            renderHTML: (attrs) => (attrs.anchorId ? { id: attrs.anchorId } : {}),
          },
        },
      },
    ];
  },
});

export interface AnchorItem {
  kind: "heading" | "bookmark";
  label: string;
  level?: number;
  pos: number;
  /** Heading id when it already has one. */
  id?: string;
}

/** Headings and bookmarks of the document, in reading order. */
export function listAnchors(doc: PMNode): AnchorItem[] {
  const out: AnchorItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim()) out.push({ kind: "heading", label: node.textContent.trim(), level: node.attrs.level, pos, id: node.attrs.anchorId || undefined });
    else if (node.type.name === "bookmark" && node.attrs.name) out.push({ kind: "bookmark", label: String(node.attrs.name), pos });
    return node.type.name !== "heading";
  });
  return out;
}

/** The `#…` target of an anchor; a heading gets a stable id the first time it is linked. */
export function anchorHref(editor: Editor, a: AnchorItem): string {
  if (a.kind === "bookmark") return `#${bookmarkId(a.label)}`;
  if (a.id) return `#${a.id}`;
  const id = `h_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const node = editor.state.doc.nodeAt(a.pos);
  if (node && node.type.name === "heading") editor.view.dispatch(editor.state.tr.setNodeMarkup(a.pos, undefined, { ...node.attrs, anchorId: id }));
  return `#${id}`;
}

/** Position of the bookmark or heading a `#…` href points to, or null. */
export function findAnchorPos(doc: PMNode, href: string): number | null {
  const id = href.replace(/^#/, "");
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "bookmark" && bookmarkId(String(node.attrs.name)) === id) found = pos;
    else if (node.type.name === "heading" && node.attrs.anchorId === id) found = pos;
    return true;
  });
  return found;
}
