export const SUPPORT_CATEGORIES = ["access", "editor", "ai", "files", "submission", "privacy", "other"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export type SupportPriority = "urgent" | "high" | "normal" | "low";
export interface SupportMessage { id: string; role: "student" | "assistant" | "team"; text: string; at: string }
export interface SupportTicket {
  id: string; userId: string; university: string; category: SupportCategory; priority: SupportPriority;
  status: "open" | "in_progress" | "resolved"; subject: string; page: string;
  createdAt: string; updatedAt: string; responseDueAt: string; firstResponseAt?: string;
  messages: SupportMessage[]; emailStatus: "pending" | "sent" | "not_configured" | "failed";
}
export function priorityFor(category: SupportCategory, text: string): SupportPriority {
  if (category === "privacy" || /lost.{0,20}(work|text|data)|perd[ií].{0,20}(trabajo|texto|datos)|datenverlust|perdu.{0,20}(travail|texte)|security|seguridad|s[eé]curit[eé]/i.test(text)) return "urgent";
  if (category === "access" || /privacy_unavailable|deadline|entrega|submit|[eé]ch[eé]ance|abgabe|cannot save|no.{0,10}guarda|enregistr.*impossible/i.test(text)) return "high";
  return category === "other" && /suggest|suger|suggestion|vorschlag/i.test(text) ? "low" : "normal";
}
export function classifySupport(text: string): SupportCategory {
  if (/privacy_unavailable/i.test(text)) return "ai";
  const patterns: [SupportCategory, RegExp][] = [
    ["privacy", /privacy|privacidad|confidential|datenschutz|security|seguridad|s[eé]curit[eé]|datos personales/i],
    ["access", /login|sign.?in|contrase[ñn]a|password|connexion|mot de passe|anmeld|cuenta|account/i],
    ["submission", /submit|submission|entrega|deadline|teacher|docente|enseignant|abgabe/i],
    ["editor", /editor|guardar|save|texte|texto|document|p[eé]rd|lost|speicher/i],
    ["files", /upload|attach|archivo|fichero|adjunt|pdf|csv|excel|fichier|datei/i],
    ["ai", /gemini|claude|token|saldo|allowance|quota|chat|assistant|asistente|modelo|model|ki\b/i],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || "other";
}
export function ticketOverdue(ticket: SupportTicket, now = Date.now()) {
  return !ticket.firstResponseAt && ticket.status !== "resolved" && now > Date.parse(ticket.responseDueAt);
}
