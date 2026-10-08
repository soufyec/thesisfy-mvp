import { Extension } from "@tiptap/core";

/** Per-cell background colour and vertical alignment (the stock table cells only carry span and width). */
export const TableExtras = Extension.create({
  name: "tableExtras",
  // Runs before the paragraph Indent shortcuts so Tab walks the cells instead of indenting the text inside one.
  priority: 1000,
  addKeyboardShortcuts() {
    const inCell = () => this.editor.isActive("table") && !this.editor.isActive("listItem") && !this.editor.isActive("taskItem");
    return {
      Tab: () => {
        if (!inCell()) return false;
        if (this.editor.commands.goToNextCell()) return true;
        // last cell: a new row, as in Docs and Word
        return this.editor.can().addRowAfter() ? this.editor.chain().addRowAfter().goToNextCell().run() : false;
      },
      "Shift-Tab": () => (inCell() ? this.editor.commands.goToPreviousCell() : false),
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).getAttribute("data-bg") || (el as HTMLElement).style.backgroundColor || null,
            renderHTML: (attrs) => (attrs.backgroundColor ? { "data-bg": attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` } : {}),
          },
          verticalAlign: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.verticalAlign || null,
            renderHTML: (attrs) => (attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign}` } : {}),
          },
        },
      },
    ];
  },
});
