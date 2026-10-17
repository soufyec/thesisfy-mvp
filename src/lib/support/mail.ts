import type { SupportTicket } from "./types";
/** Server-only destination: never returned by the student API or included in browser modules. */
export async function notifySupport(ticket: SupportTicket): Promise<SupportTicket["emailStatus"]> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_NOTIFY_TO;
  const from = process.env.SUPPORT_FROM_EMAIL;
  if (!key || !from || !to) return "not_configured";
  try {
    // Only a ticket reference and category go through email. Read private messages in the authenticated inbox.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `support-${ticket.id}-${ticket.messages.length}` },
      body: JSON.stringify({ from, to: [to], subject: `[Thesisfic ${ticket.priority}] ${ticket.id}`, text: `Support ticket ${ticket.id}\nCategory: ${ticket.category}\nStatus: ${ticket.status}\nFirst response due: ${ticket.responseDueAt}\nOpen /equipe/support on your Thesisfic site to read and reply. Student messages are not included in email.` }),
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
    return response.ok ? "sent" : "failed";
  } catch { return "failed"; }
}
