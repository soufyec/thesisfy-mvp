import type { Messages } from "../index";

/**
 * Assignments set by a teacher (docs/papers.md §1.2, §3.2, §4.3). Vocabulary (D5): Assignment / Tarea (f) / Devoir (m) /
 * Aufgabe (f); Brief / Enunciado (m) / Consigne (f) / Aufgabenstellung (f). Agreement follows those genders.
 * Skeleton from the foundation phase: keys used by `AssignmentBrief`; the assignment UI adds the rest.
 * Spanish uses "tú"; French "vous"; German "Sie". No exclamation marks.
 */
const en = {
  // Status
  "assignments.status.open": "Open",
  "assignments.status.closed": "Closed",

  // AssignmentBrief (student, teacher and admin see the same card)
  "assignments.brief.assignedBy": "Assigned by {name}",
  "assignments.brief.detailsAria": "Assignment details",
  "assignments.brief.due": "Due date",
  "assignments.brief.noDue": "No due date",
  "assignments.brief.target": "Word target",
  "assignments.brief.citationStyle": "Citation style",
  "assignments.brief.notSet": "Not set",
  "assignments.brief.updated": "Brief updated {date}",
  "assignments.brief.empty": "No brief yet.",
  "assignments.brief.closedNote": "This assignment is closed: no new papers can be started from it.",
};

export const assignments: Messages<typeof en> = {
  en,
  es: {
    "assignments.status.open": "Abierta",
    "assignments.status.closed": "Cerrada",

    "assignments.brief.assignedBy": "Asignada por {name}",
    "assignments.brief.detailsAria": "Datos de la tarea",
    "assignments.brief.due": "Fecha de entrega",
    "assignments.brief.noDue": "Sin fecha de entrega",
    "assignments.brief.target": "Objetivo de palabras",
    "assignments.brief.citationStyle": "Estilo de cita",
    "assignments.brief.notSet": "Sin definir",
    "assignments.brief.updated": "Enunciado actualizado el {date}",
    "assignments.brief.empty": "Todavía no hay enunciado.",
    "assignments.brief.closedNote": "Esta tarea está cerrada: ya no se pueden empezar trabajos nuevos a partir de ella.",
  },
  fr: {
    "assignments.status.open": "Ouvert",
    "assignments.status.closed": "Clos",

    "assignments.brief.assignedBy": "Donné par {name}",
    "assignments.brief.detailsAria": "Informations sur le devoir",
    "assignments.brief.due": "Échéance",
    "assignments.brief.noDue": "Pas d'échéance",
    "assignments.brief.target": "Objectif de mots",
    "assignments.brief.citationStyle": "Style de citation",
    "assignments.brief.notSet": "Non précisé",
    "assignments.brief.updated": "Consigne mise à jour le {date}",
    "assignments.brief.empty": "Pas encore de consigne.",
    "assignments.brief.closedNote": "Ce devoir est clos : il n'est plus possible d'y commencer un nouveau travail.",
  },
  de: {
    "assignments.status.open": "Offen",
    "assignments.status.closed": "Geschlossen",

    "assignments.brief.assignedBy": "Gestellt von {name}",
    "assignments.brief.detailsAria": "Angaben zur Aufgabe",
    "assignments.brief.due": "Abgabetermin",
    "assignments.brief.noDue": "Kein Abgabetermin",
    "assignments.brief.target": "Wortziel",
    "assignments.brief.citationStyle": "Zitierstil",
    "assignments.brief.notSet": "Nicht festgelegt",
    "assignments.brief.updated": "Aufgabenstellung aktualisiert am {date}",
    "assignments.brief.empty": "Noch keine Aufgabenstellung.",
    "assignments.brief.closedNote": "Diese Aufgabe ist geschlossen: Es können keine neuen Arbeiten mehr dazu begonnen werden.",
  },
};
