"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Minus, Send, X, List } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { api } from "@/lib/client";
import { useLocale, useT, useFormat } from "@/lib/i18n/client";
import { SUPPORT_CATEGORIES, type SupportCategory, type SupportTicket } from "@/lib/support/types";
export default function SupportWidget() {
  const path = usePathname(); const t = useT(); const fmt = useFormat(); const { locale } = useLocale();
  const [authenticated, setAuthenticated] = useState(false); const [open, setOpen] = useState(false); const [compact, setCompact] = useState(false);
  const [text, setText] = useState(""); const [lastQuestion, setLastQuestion] = useState(""); const [category, setCategory] = useState<SupportCategory | "">("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]); const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null); const [listing, setListing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!listing && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages.length, ticket?.id, ticket?.messages.length, listing]);
  useEffect(() => { let active = true; if (path.startsWith("/dashboard")) api<{ user: unknown }>("/api/auth/me").then(r => { if (active) setAuthenticated(!!r.user); }).catch(() => { if (active) setAuthenticated(false); }); else setAuthenticated(false); return () => { active = false; }; }, [path]);
  useEffect(() => { try { setCompact(localStorage.getItem("thesisfic.support.compact") === "1"); } catch {} }, []);
  useEffect(() => {
    if (!authenticated) return;
    const id = new URLSearchParams(window.location.search).get("help"); if (!id) return;
    let active = true;
    void api<{ tickets: SupportTicket[] }>("/api/support").then(r => { const row = r.tickets.find(x => x.id === id); if (active && row) { setTickets(r.tickets); setTicket(row); setOpen(true); setListing(false); } }).catch(() => {});
    return () => { active = false; };
  }, [authenticated, path]);
  useEffect(() => {
    if (!open || !authenticated) return;
    let active = true;
    const load = () => api<{ tickets: SupportTicket[] }>("/api/support").then(r => { if (active) { setTickets(r.tickets); setTicket(current => current ? r.tickets.find(x => x.id === current.id) || current : null); } }).catch(() => {});
    void load(); const timer = setInterval(load, 30000); return () => { active = false; clearInterval(timer); };
  }, [open, authenticated]);
  const minimize = () => { setOpen(false); setCompact(true); try { localStorage.setItem("thesisfic.support.compact", "1"); } catch {} };
  const send = async (createTicket = false) => {
    const question = text.trim() || (createTicket ? lastQuestion : ""); if (!question || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ answer?: string; category?: SupportCategory; canRefresh?: boolean; ticket?: SupportTicket }>("/api/support", { method: "POST", json: { text: question, category: category || undefined, locale, page: path, createTicket, ticketId: ticket?.id } });
      if (result.category) setCategory(result.category);
      if (result.ticket) { setTicket(result.ticket); setListing(false); setTickets(prev => [result.ticket!, ...prev.filter(x => x.id !== result.ticket!.id)]); }
      else {
        let answer = result.answer || t("support.error");
        if (result.canRefresh) {
          try { const options = await api("/api/ai/providers"); window.dispatchEvent(new CustomEvent("thesisfic:refresh-ai", { detail: options })); answer += "\n\n" + t("support.refreshed"); } catch { /* Keep the guidance; do not claim a repair succeeded. */ }
        }
        setMessages(prev => [...prev, { role: "student", text: question }, { role: "assistant", text: answer }]);
      }
      setLastQuestion(question); setText("");
    } catch { setError(t(createTicket || ticket ? "support.unavailable" : "support.error")); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setError("");
    try { const options = await api("/api/ai/providers"); window.dispatchEvent(new CustomEvent("thesisfic:refresh-ai", { detail: options })); setMessages(prev => [...prev, { role: "assistant", text: t("support.refreshed") }]); }
    catch { setError(t("support.error")); } finally { setBusy(false); }
  };
  if (!authenticated) return null;
  return <aside className="fixed left-3 bottom-20 sm:bottom-3 z-50" aria-label={t("support.title")}>
    {open ? <section role="dialog" aria-labelledby="support-title" onKeyDown={e => { if (e.key === "Escape") minimize(); }} className="w-[360px] max-w-[calc(100vw-24px)] max-h-[75dvh] bg-white border border-gray-200 shadow-xl rounded-2xl flex flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-gray-100 p-3"><LogoMark size={25} /><h2 id="support-title" className="font-semibold text-sm flex-1">{t("support.title")}</h2><button aria-label={t("support.myTickets")} onClick={() => setListing(x => !x)} className="p-1.5 rounded-lg hover:bg-gray-100"><List size={17} /></button><button aria-label={t("support.minimize")} onClick={minimize} className="p-1.5 rounded-lg hover:bg-gray-100"><Minus size={17} /></button></header>
      <div ref={transcript} className="p-3 space-y-3 overflow-y-auto text-sm min-h-0" aria-live="polite">
        <p className="text-gray-700">{t("support.intro")}</p><p className="text-xs text-brand-700">{t("support.sla")}</p>
        {listing ? <><h3 className="font-semibold">{t("support.myTickets")}</h3>{!tickets.length && <p>{t("support.empty")}</p>}{tickets.map(row => <button key={row.id} onClick={() => { setTicket(row); setListing(false); }} className="block w-full text-left border border-gray-200 rounded-lg p-2"><span className="font-medium">{row.id} · {t(`support.${row.status === "open" ? "openStatus" : row.status}`)}</span><span className="block text-xs truncate">{row.subject}</span></button>)}</> : <>
          {ticket && <><button onClick={() => { setTicket(null); setMessages([]); setLastQuestion(""); }} className="text-brand-700 underline">{t("support.back")}</button><p className="text-xs font-medium">{t("support.created", { id: ticket.id, date: fmt.date(ticket.responseDueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p><p className="text-xs">{t(`support.${ticket.status === "open" ? "openStatus" : ticket.status}`)} · {t(`support.${ticket.priority}`)}</p></>}
          {(ticket?.messages || messages).map((m, i) => <p key={"id" in m ? String(m.id) : i} className={`rounded-xl p-2.5 whitespace-pre-wrap break-words ${m.role === "student" ? "bg-brand-50 ml-4" : "bg-gray-50 mr-4"}`}>{m.text}</p>)}
          {category === "ai" && !ticket && <button disabled={busy} className="text-brand-700 underline" onClick={refresh}>{t("support.refresh")}</button>}
        </>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </div>
      {!listing && <form onSubmit={e => { e.preventDefault(); void send(); }} className="p-3 border-t border-gray-100 space-y-2">
        {!ticket && <select aria-label={t("support.category")} value={category} onChange={e => setCategory(e.target.value as SupportCategory)} className="w-full rounded-lg border border-gray-200 p-1.5 text-xs"><option value="">{t("support.category")}</option>{SUPPORT_CATEGORIES.map(c => <option key={c} value={c}>{t(`support.category.${c}`)}</option>)}</select>}
        <label className="sr-only" htmlFor="support-question">{t("support.placeholder")}</label><textarea id="support-question" autoFocus value={text} onChange={e => setText(e.target.value)} maxLength={4000} rows={2} placeholder={t("support.placeholder")} className="w-full rounded-lg border border-gray-200 p-2 text-sm" />
        <div className="flex gap-2"><button disabled={busy || !text.trim()} type="submit" className="btn-primary text-xs flex gap-1 items-center"><Send size={14} />{t("support.send")}</button>{!ticket && <button type="button" disabled={busy || !(text.trim() || lastQuestion)} onClick={() => void send(true)} className="px-3 py-2 rounded-lg border border-gray-200 text-xs hover:bg-gray-50">{t("support.ticket")}</button>}</div>
        <p className="text-[11px] text-gray-500">{t("support.privacyNote")}</p>
      </form>}
    </section> : <div className="flex items-center gap-1"><button onClick={() => { setOpen(true); setListing(false); }} aria-label={t("support.open")} className={`flex items-center gap-2 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-brand-50 ${compact ? "p-1.5" : "px-3 py-2"}`}><LogoMark size={compact ? 19 : 29} />{!compact && <span className="text-xs font-medium">{t("support.title")}</span>}</button>{!compact && <button onClick={minimize} className="bg-white rounded-full border border-gray-200 p-1 text-gray-500" aria-label={t("support.compact")}><X size={12} /></button>}</div>}
  </aside>;
}
