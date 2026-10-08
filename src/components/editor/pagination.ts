import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";

/**
 * Visual pagination for the continuous sheet: measures each top-level block and, when a block would
 * cross the bottom of the current page, inserts a non-editable "page gap" widget before it so the block
 * starts on the next page. Manual page breaks (`pageBreak` nodes) force a new page. Decorative only:
 * nothing is written to the document, and under 768px the sheet stays continuous.
 */
const key = new PluginKey<DecorationSet>("pagination");
const PX_PER_CM = 37.795;
/** Grey band between two pages, in px (unzoomed). */
const GAP_PX = 28;

function cm(value: string): number {
  const v = parseFloat(value);
  if (!isFinite(v)) return 0;
  return value.trim().endsWith("cm") ? v * PX_PER_CM : v;
}

type Options = { onPages?: (pages: number) => void };

export const Pagination = Extension.create<Options>({
  name: "pagination",
  addOptions() {
    return { onPages: undefined };
  },
  addProseMirrorPlugins() {
    const onPages = this.options.onPages;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSig = "";
    let lastPages = 0;

    const measure = (view: EditorView): { decos: Decoration[]; pages: number; sig: string } | null => {
      const sheet = view.dom.closest(".docs-page") as HTMLElement | null;
      const ws = view.dom.closest(".docs-workspace") as HTMLElement | null;
      if (!sheet || !ws) return null;
      if (window.innerWidth < 768) return { decos: [], pages: 1, sig: "mobile" };
      const cs = getComputedStyle(ws);
      const pageH = cm(cs.getPropertyValue("--page-min-height")) || 29.7 * PX_PER_CM;
      const margin = cm(cs.getPropertyValue("--page-margin")) || 2.54 * PX_PER_CM;
      const contentH = pageH - 2 * margin;
      if (contentH < 200) return null;
      const decos: Decoration[] = [];
      const parts: string[] = [];
      let y = 0;
      let pages = 1;
      const gapBefore = (pos: number, fill: number) => {
        const el = document.createElement("div");
        el.className = "page-gap";
        el.contentEditable = "false";
        el.setAttribute("aria-hidden", "true");
        el.style.height = `${Math.round(fill + 2 * margin + GAP_PX)}px`;
        el.style.setProperty("--gap-fill", `${Math.round(fill + margin)}px`);
        el.style.setProperty("--gap-size", `${GAP_PX}px`);
        el.dataset.page = String(pages + 1);
        const label = document.createElement("span");
        label.className = "page-gap-label";
        label.textContent = String(pages + 1);
        el.appendChild(label);
        decos.push(Decoration.widget(pos, el, { side: -1, key: `pg-${pos}-${Math.round(fill)}` }));
        parts.push(`${pos}:${Math.round(fill)}`);
        pages += 1;
        y = 0;
      };
      view.state.doc.forEach((node, offset) => {
        const dom = view.nodeDOM(offset);
        if (!(dom instanceof HTMLElement)) return;
        if (node.type.name === "pageBreak") {
          const st = getComputedStyle(dom);
          y += dom.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
          gapBefore(offset + node.nodeSize, Math.max(0, contentH - y));
          return;
        }
        const st = getComputedStyle(dom);
        const h = dom.offsetHeight + (parseFloat(st.marginTop) || 0) + (parseFloat(st.marginBottom) || 0);
        if (y > 0 && y + h > contentH && h <= contentH) gapBefore(offset, contentH - y);
        y += h;
        while (y > contentH) {
          // a block taller than a page keeps flowing across the boundary
          y -= contentH;
          pages += 1;
        }
      });
      return { decos, pages, sig: parts.join("|") + `#${pages}` };
    };

    const apply = (view: EditorView) => {
      const m = measure(view);
      if (!m) return;
      if (m.sig !== lastSig) {
        lastSig = m.sig;
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, m.decos)).setMeta("addToHistory", false));
      }
      if (m.pages !== lastPages) {
        lastPages = m.pages;
        onPages?.(m.pages);
      }
    };

    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(key) as DecorationSet | undefined;
            if (next) return next;
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) || DecorationSet.empty;
          },
        },
        view(view) {
          const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => apply(view), 140);
          };
          const sheet = view.dom.closest(".docs-page");
          const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
          if (sheet && ro) ro.observe(sheet);
          window.addEventListener("resize", schedule);
          schedule();
          return {
            update(_v, prev) {
              if (!prev.doc.eq(view.state.doc)) schedule();
            },
            destroy() {
              if (timer) clearTimeout(timer);
              ro?.disconnect();
              window.removeEventListener("resize", schedule);
            },
          };
        },
      }),
    ];
  },
});
