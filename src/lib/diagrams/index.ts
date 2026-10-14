/** Public entry of the diagrams module (docs/papers.md §9.3): types, validation, rendering and their strings. */
export * from "./types";
export {
  CONCEPT_EDGE_LABEL_MAX,
  CONCEPT_ID_MAX,
  CONCEPT_LABEL_MAX,
  CONCEPT_MAX_EDGES,
  CONCEPT_MAX_NODES,
  CONCEPT_MIN_NODES,
  GANTT_AUTO_WEEK_DAYS,
  GANTT_GROUP_MAX,
  GANTT_LABEL_MAX,
  GANTT_MAX_TASKS,
  GANTT_MAX_YEARS,
  PRISMA_MAX_COUNT,
  PRISMA_MAX_REASONS,
  PRISMA_REASON_MAX,
  diagramErrorText,
  diagramWarningText,
  numbersAppearIn,
  parseDiagramDate,
  prismaWarnings,
  sanitizeDiagram,
} from "./validate";
export { DIAGRAM_DEFAULT_WIDTH, defaultDiagramNumberFormat, renderDiagramSvg } from "./render";
export { DIAGRAM_MESSAGES, diagramTranslator, type DiagramMessageKey } from "./messages";
export { DIAGRAM_COLORS, DIAGRAM_SERIES } from "./theme";
