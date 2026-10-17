"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import { SUPPORT_CATEGORIES, ticketOverdue, type SupportTicket } from "@/lib/support/types";
export default function SupportInbox() {
  const t = useT(); const fmt = useFormat();
  const [tickets, setTickets] = useState<SupportTicket[]>([]); const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState(""); const [status, setStatus] = useState(""); const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [clock, setClock] = useState(Date.now());
  const load = useCallback(async () => {
    try { const r = await api<{ tickets: SupportTicket[] }>("/api/equipe/support"); setTickets(r.tickets); setClock(Date.now()); }
    catch { setError(t("support.error")); }
  }, [t]);
  useEffect(() => { void load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  const ticket = tickets.find(x => x.id === selected);
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const rows = tickets.filter(x => (!category || x.category === category) && (!status || x.status === status)).sort((a, b) => Number(ticketOverdue(b, clock)) - Number(ticketOverdue(a, clock)) || rank[a.priority] - rank[b.priority] || a.responseDueAt.localeCompare(b.responseDueAt));
  const update = async (patch: Record<string, unknown>) => {
    if (!ticket || busy) return; setBusy(true); setError("");
    try { const r = await api<{ ticket: SupportTicket }>("/api/equipe/support", { method: "PATCH", json: { id: ticket.id, ...patch } }); setTickets(prev => prev.map(x => x.id === r.ticket.id ? r.ticket : x)); if (patch.reply) setReply(""); }
    catch { setError(t("support.error")); } finally { setBusy(false); }
  };
  const statusText = (s: string) => t(`support.${s === "open" ? "openStatus" : s}`);
  return <main className="max-w-6xl mx-auto p-4 sm:p-8">
    <header className="flex items-center justify-between gap-3 mb-5"><h1 className="text-2xl font-semibold">{t("support.inbox")}</h1><Link href="/equipe/produit" className="text-sm underline text-brand-700">{t("support.back")}</Link></header>
    <p className="text-sm text-gray-600 mb-4">{t("support.sla")}</p>
    {tickets.some(x => x.emailStatus !== "sent" && x.status !== "resolved") && <p role="status" className="bg-amber-50 text-amber-800 p-3 rounded-xl text-sm mb-4">{t("support.emailWarning")}</p>}
    {error && <p role="alert" className="text-red-600 mb-3">{error}</p>}
    <div className="flex flex-wrap gap-3 mb-4"><label className="text-sm">{t("support.category")}<select value={category} onChange={e => setCategory(e.target.value)} className="ml-2 border rounded-lg p-2"><option value="">{t("support.all")}</option>{SUPPORT_CATEGORIES.map(c => <option key={c} value={c}>{t(`support.category.${c}`)}</option>)}</select></label><label className="text-sm">{t("support.status")}<select value={status} onChange={e => setStatus(e.target.value)} className="ml-2 border rounded-lg p-2"><option value="">{t("support.all")}</option>{["open", "in_progress", "resolved"].map(s => <option key={s} value={s}>{statusText(s)}</option>)}</select></label></div>
    <div className="grid md:grid-cols-[340px_1fr] gap-4"><section aria-label={t("support.inbox")} className="space-y-2 max-h-[70dvh] overflow-auto">{!rows.length && <p>{t("support.empty")}</p>}{rows.map(row => <button key={row.id} onClick={() => { setSelected(row.id); setReply(""); }} className={`w-full text-left p-3 rounded-xl border ${selected === row.id ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-white"}`}><span className="text-xs font-semibold">{row.id} · {t(`support.${row.priority}`)}</span><p className="text-sm truncate">{row.subject}</p><p className="text-xs text-gray-500">{t(`support.category.${row.category}`)} · {row.university}</p>{ticketOverdue(row, clock) && <p className="text-xs text-red-600 font-medium">{t("support.overdue")}</p>}</button>)}</section>
    {ticket && <section className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3"><h2 className="font-semibold">{ticket.id} · {ticket.subject}</h2><p className="text-xs text-gray-500">{ticket.university} · {ticket.page}</p><p className="text-sm">{t("support.created", { id: ticket.id, date: fmt.date(ticket.responseDueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p><div className="flex gap-2 flex-wrap"><label className="text-xs">{t("support.status")}<select disabled={busy} value={ticket.status} onChange={e => void update({ status: e.target.value, ...(reply.trim() ? { reply } : {}) })} className="border rounded-lg p-1.5 ml-1">{["open", "in_progress", "resolved"].map(s => <option key={s} value={s}>{statusText(s)}</option>)}</select></label><label className="text-xs">{t("support.priority")}<select disabled={busy} value={ticket.priority} onChange={e => void update({ priority: e.target.value })} className="border rounded-lg p-1.5 ml-1">{["urgent", "high", "normal", "low"].map(s => <option key={s} value={s}>{t(`support.${s}`)}</option>)}</select></label></div>
    <div className="space-y-2 max-h-[42dvh] overflow-auto">{ticket.messages.map(m => <article key={m.id} className={`p-3 rounded-xl text-sm whitespace-pre-wrap break-words ${m.role === "student" ? "bg-gray-50" : "bg-brand-50"}`}><p className="text-xs text-gray-500 mb-1">{m.role === "student" ? ticket.userId : m.role === "team" ? t("support.inbox") : t("support.title")} · {fmt.date(m.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>{m.text}</article>)}</div>
    <form onSubmit={e => { e.preventDefault(); void update({ reply, status: "in_progress" }); }} className="space-y-2"><label className="block text-sm" htmlFor="support-reply">{t("support.reply")}</label><textarea id="support-reply" value={reply} onChange={e => setReply(e.target.value)} maxLength={4000} rows={3} className="border rounded-xl p-2 w-full" /><button className="btn-primary" disabled={busy || !reply.trim()}>{t("support.send")}</button></form>{ticket.emailStatus !== "sent" && <button disabled={busy} onClick={() => void update({ retryEmail: true })} className="text-sm underline text-brand-700">{t("support.emailRetry")}</button>}
    </section>}</div>
  </main>;
}
