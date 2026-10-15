/** Only the rendered drawing follows the pointer; toolbars, captions and provenance UI stay in place. */
let cleanup: (() => void) | undefined;
export function clearFigureDragImage() { cleanup?.(); cleanup = undefined; }
export function setFigureDragImage(transfer: DataTransfer, svg: string, width = 360) {
  clearFigureDragImage();
  const preview = document.createElement("div");
  preview.dataset.dragPreview = "figure";
  preview.setAttribute("aria-hidden", "true");
  Object.assign(preview.style, { position: "fixed", left: "-10000px", top: "0", width: `${Math.max(120, Math.min(480, width))}px`, pointerEvents: "none", background: "white" });
  // SVG comes exclusively from Thesisfic's escaped chart/diagram renderers.
  preview.innerHTML = svg;
  const drawing = preview.querySelector("svg");
  if (!drawing) return;
  drawing.style.width = "100%"; drawing.style.height = "auto"; drawing.style.display = "block";
  document.body.appendChild(preview);
  const bounds = preview.getBoundingClientRect();
  transfer.setDragImage(preview, Math.round(bounds.width / 2), Math.round(Math.min(bounds.height / 2, 72)));
  const clear = () => clearFigureDragImage();
  const timer = setTimeout(clear, 120000);
  window.addEventListener("dragend", clear, { once: true });
  window.addEventListener("drop", clear, { once: true });
  cleanup = () => { clearTimeout(timer); preview.remove(); window.removeEventListener("dragend", clear); window.removeEventListener("drop", clear); };
}
