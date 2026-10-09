"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bot, CheckCircle2, ExternalLink, FileText, Flag, Monitor, Smartphone } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { DeadlineChip, Modal, ScoreRing, Toast } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api, statusColors } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { modeLabel, noticeTypeLabel, plural, statusLabel, timeAgoLabel } from "@/lib/i18n/messages/admin";
import ProcessPanel from "@/components/editor/process/ProcessPanel";

interface Detail {
  thesis: { id: string; title: string; description: string; status: string; wordCount: number; targetWords: number; aiUsagePercent: number; integrityScore: number; provenance: { human: number; paste: number; ai: number }; studentName: string; professorName: string; updatedAt: string; deadline?: string; citationStyle: string; createdAt: string };
  comments: { id: string; authorName: string; authorRole?: string; text: string; resolved: boolean; createdAt: string; quote: string }[];
  flags: { id: string; type: string; severity: string; description: string; timestamp: string; resolved: boolean; resolvedBy?: string; resolutionNote?: string }[];
  versionCount: number;
  policy: { maxAiUsagePercent: number };
  interactions: { id: string; provider: string; model: string; mode: string; source: string; promptPreview: string; responsePreview: string; insertedWords: number; blockedByPolicy: boolean; timestamp: string }[];
}
interface Session { id: string; startedAt: string; endedAt?: string; lastHeartbeatAt: string; wordsWritten: number; aiAssists: number; keystrokes: number; pasteEvents: number; tabSwitches: number; device: string; consentId?: string; events: { id: string; type: string; timestamp: string; data: Record<string, unknown> }[]; integrityFlags: { id: string }[] }

export default function AdminThesisDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useUser();
  const t = useT();
  const fmt = useFormat();
  const ago = (iso: string) => timeAgoLabel(t, fmt.date, iso);
  const [d, setD] = useState<Detail | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [resolve, setResolve] = useState<{ id: string; note: string } | null>(null);
  const [review, setReview] = useState<{ status: string; note: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/theses/${params.id}`).then(setD).catch(() => setMissing(true));
    api<{ sessions: Session[] }>(`/api/theses/${params.id}/sessions`).then((r) => setSessions(r.sessions)).catch(() => {});
  }, [params.id]);
  useEffect(() => {
    load();
  }, [load]);

  if (missing) return <DashboardLayout><div className="card p-8 max-w-lg"><h1 className="text-lg font-semibold mb-2">{t("admin.detail.notFound")}</h1><p className="text-sm text-gray-500 mb-4">{t("admin.detail.notFoundHelp")}</p><Link href="/admin/theses" className="btn-outline !py-2 !px-4 text-sm">{t("common.back")}</Link></div></DashboardLayout>;
  if (!d) return <DashboardLayout><div className="text-gray-400 text-sm">{t("common.loading")}…</div></DashboardLayout>;
  const th = d.thesis;
  const total = Math.max(1, th.provenance.human + th.provenance.paste + th.provenance.ai);
  const pct = (n: number) => Math.round((n / total) * 100);
  const duration = (s: Session) => Math.max(1, Math.round((new Date(s.endedAt || s.lastHeartbeatAt).getTime() - new Date(s.startedAt).getTime()) / 60000));

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="text-xs text-gray-400 mb-2"><Link href="/admin/theses" className="hover:text-brand-600">{t("admin.theses.title")}</Link> / {th.studentName}</div>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
          <div className="min-w-0"><h1 className="text-2xl font-bold">{th.title}</h1><p className="text-gray-500 mt-1 text-sm">{th.description}</p><div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-gray-500"><span className={statusColors[th.status]}>{statusLabel(t, th.status)}</span><span>{th.studentName}</span><span>· {t("admin.detail.advisor", { name: th.professorName })}</span><span>· {t("admin.detail.wordsOfTarget", { n: fmt.number(th.wordCount), target: fmt.number(th.targetWords) })}</span><span>· {th.citationStyle}</span>{th.deadline && <span>· {t("admin.detail.due", { date: fmt.date(th.deadline) })}</span>}{th.deadline && <DeadlineChip deadline={th.deadline} wordCount={th.wordCount} targetWords={th.targetWords} />}<span>· {t("admin.detail.updated", { ago: ago(th.updatedAt) })}</span></div></div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ScoreRing value={th.integrityScore} size={64} />
            <Link href={`/admin/theses/${th.id}/document`} className="btn-primary !py-2 !px-4 text-sm"><FileText className="w-4 h-4 mr-1" />{t("admin.detail.openDocument")}</Link>
            <button onClick={() => setReview({ status: th.status === "under_review" ? "approved" : "revision_requested", note: "" })} className="btn-outline !py-2 !px-4 text-sm">{t("admin.detail.reviewDecision")}</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold mb-3">{t("admin.detail.provReport")}</h2>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 mb-2"><div className="bg-green-500" style={{ width: `${pct(th.provenance.human)}%` }} /><div className="bg-amber-400" style={{ width: `${pct(th.provenance.paste)}%` }} /><div className="bg-purple-500" style={{ width: `${pct(th.provenance.ai)}%` }} /></div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-green-600 font-bold text-lg">{pct(th.provenance.human)}%</div><div className="text-xs text-gray-500">{t("admin.detail.typed", { n: fmt.number(th.provenance.human) })}</div></div>
              <div><div className="text-amber-500 font-bold text-lg">{pct(th.provenance.paste)}%</div><div className="text-xs text-gray-500">{t("admin.detail.pasted", { n: fmt.number(th.provenance.paste) })}</div></div>
              <div><div className={`font-bold text-lg ${pct(th.provenance.ai) > d.policy.maxAiUsagePercent ? "text-red-600" : "text-purple-600"}`}>{pct(th.provenance.ai)}%</div><div className="text-xs text-gray-500">{t("admin.detail.aiAssisted", { n: fmt.number(th.provenance.ai), limit: d.policy.maxAiUsagePercent })}</div></div>
            </div>
            <p className="text-xs text-gray-400 mt-3">{t("admin.detail.provNote")}</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3"><Flag className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">{t("admin.detail.noticesTitle")}</h2></div>
            {d.flags.length === 0 && <div className="text-sm text-gray-400">{t("admin.detail.noNotices")}</div>}
            <div className="space-y-2">
              {d.flags.map((f) => (
                <div key={f.id} className={`p-2.5 rounded-xl border text-xs ${f.resolved ? "border-gray-100 opacity-60" : f.severity === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                  <div className="flex items-center gap-2 mb-1"><span className={`badge ${f.severity === "high" ? "badge-danger" : f.severity === "medium" ? "badge-warning" : "badge-info"} !text-[10px]`}>{t(`admin.level.${f.severity}`)}</span><span className="font-medium">{noticeTypeLabel(t, f.type)}</span><span className="ml-auto text-gray-400">{ago(f.timestamp)}</span></div>
                  <div className="text-gray-700 whitespace-pre-wrap">{f.description}</div>
                  {f.resolved ? <div className="text-green-700 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{f.resolutionNote ? t("admin.detail.resolvedNote", { note: f.resolutionNote }) : t("admin.detail.resolved")}</div> : <button onClick={() => setResolve({ id: f.id, note: "" })} className="mt-1.5 text-brand-600 hover:underline">{t("admin.detail.resolveAction")}</button>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">{t("admin.detail.sessionsTitle", { n: sessions.length })}</h2><p className="text-xs text-gray-400 mt-0.5">{t("admin.detail.consentOnly")}</p></div>
            <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {sessions.length === 0 && <div className="p-6 text-sm text-gray-400">{t("admin.detail.noSessions")}</div>}
              {sessions.map((s) => (
                <div key={s.id} className="p-4 text-sm">
                  <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full text-left">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{fmt.date(s.startedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span><span className="text-xs text-gray-400">{t("common.minutes", { n: duration(s) })}</span>{s.device === "mobile" ? <Smartphone className="w-3.5 h-3.5 text-gray-400" /> : <Monitor className="w-3.5 h-3.5 text-gray-400" />}{!s.endedAt && Date.now() - new Date(s.lastHeartbeatAt).getTime() < 5 * 60 * 1000 && <span className="badge-success !text-[10px]">{t("admin.detail.live")}</span>}{!s.consentId && <span className="badge bg-gray-100 text-gray-500 !text-[10px]">{t("admin.detail.noConsent")}</span>}{s.integrityFlags.length > 0 && <span className="badge-warning !text-[10px]">{plural(t, "admin.notices", s.integrityFlags.length)}</span>}</div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap"><span>{s.wordsWritten === 1 ? t("common.word_one") : t("common.words", { n: s.wordsWritten })}</span><span>{t("admin.detail.keys", { n: fmt.number(s.keystrokes) })}</span><span>{t("admin.detail.aiCount", { n: s.aiAssists })}</span><span>{t("admin.detail.pastes", { n: s.pasteEvents })}</span><span>{t("admin.detail.tabSwitches", { n: s.tabSwitches })}</span></div>
                  </button>
                  {open === s.id && (
                    <ul className="mt-2 pl-3 border-l border-gray-100 space-y-1 text-xs text-gray-600 max-h-48 overflow-y-auto">
                      {s.events.length === 0 && <li className="text-gray-400">{t("admin.detail.noEvents")}</li>}
                      {s.events.slice(-60).map((e) => (
                        <li key={e.id}><span className="text-gray-400">{fmt.time(e.timestamp, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> <span className="font-medium capitalize">{e.type.replace(/_/g, " ")}</span> <span className="text-gray-500">{Object.entries(e.data).filter(([k]) => !["fingerprint", "interactionId", "flagId", "reportedAt"].includes(k)).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ")}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2"><Bot className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">{t("admin.detail.aiLogTitle", { n: d.interactions.length })}</h2></div>
            <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {d.interactions.length === 0 && <div className="p-6 text-sm text-gray-400">{t("admin.detail.noAiLog")}</div>}
              {d.interactions.map((i) => (
                <div key={i.id} className="p-4 text-sm">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{modeLabel(t, i.mode)}</span><span className="text-xs text-gray-400">{i.provider} · {i.model}</span>{i.mode === "copilot" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px]">{t("admin.dashboard.copilotBadge")}</span>}{i.blockedByPolicy && <span className="badge-danger !text-[10px]">{t("admin.dashboard.blocked")}</span>}{i.insertedWords > 0 && <span className="badge bg-purple-50 text-purple-700 !text-[10px]">{t("admin.detail.wordsInserted", { n: i.insertedWords })}</span>}<span className="ml-auto text-[11px] text-gray-400">{ago(i.timestamp)}</span></div>
                  <div className="text-gray-700 mt-1"><span className="text-gray-400">{t("admin.detail.prompt")}</span> {i.promptPreview}</div>
                  {i.responsePreview && <div className="text-gray-500 text-xs mt-0.5 truncate"><span className="text-gray-400">{t("admin.detail.reply")}</span> {i.responsePreview}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card mt-6">
          <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">{t("admin.detail.processTitle")}</h2><p className="text-xs text-gray-400 mt-0.5">{t("admin.detail.processDesc")}</p></div>
          <div className="h-[720px]"><ProcessPanel thesisId={th.id} isOwner={false} embedded onClose={() => {}} /></div>
        </div>

        <div className="card mt-6">
          <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">{t("admin.detail.commentsTitle", { n: d.comments.length })}</h2></div>
          <div className="divide-y divide-gray-50">
            {d.comments.length === 0 && <div className="p-6 text-sm text-gray-400">{t("admin.detail.noComments")}</div>}
            {d.comments.map((c) => <div key={c.id} className="p-4 text-sm"><div className="flex items-center gap-2">{c.authorRole === "ai" && <Bot className="w-4 h-4 text-prov-ai-deep flex-shrink-0" aria-hidden="true" />}<span className="font-medium">{c.authorName}</span><span className="text-xs text-gray-400">{ago(c.createdAt)}</span>{c.resolved && <span className="badge-success !text-[10px]">{t("admin.detail.resolvedBadge")}</span>}</div>{c.quote && <div className="text-xs text-gray-400 border-l-2 border-amber-300 pl-2 my-1">{c.quote}</div>}<div>{c.text}</div></div>)}
          </div>
        </div>
      </div>

      <Modal open={!!resolve} onClose={() => setResolve(null)} title={t("admin.detail.resolveTitle")} size="sm" footer={<><button onClick={() => setResolve(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={async () => { if (!resolve) return; await api(`/api/flags/${resolve.id}`, { method: "PATCH", json: { note: resolve.note } }).catch(() => {}); setResolve(null); setToast({ message: t("admin.detail.resolveToast"), kind: "success" }); load(); }} className="btn-primary !py-2 !px-4 text-sm">{t("admin.detail.resolveButton")}</button></>}>
        <textarea autoFocus value={resolve?.note || ""} onChange={(e) => setResolve(resolve && { ...resolve, note: e.target.value })} className="input-field" rows={3} placeholder={t("admin.detail.resolvePlaceholder")} />
      </Modal>
      <Modal open={!!review} onClose={() => setReview(null)} title={t("admin.detail.reviewDecision")} size="sm" footer={<><button onClick={() => setReview(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={async () => { if (!review) return; await api(`/api/theses/${th.id}`, { method: "PUT", json: { status: review.status, reviewNote: review.note } }).catch((e) => setToast({ message: (e as Error).message, kind: "error" })); setReview(null); setToast({ message: t("admin.detail.decisionToast"), kind: "success" }); load(); }} className="btn-primary !py-2 !px-4 text-sm">{t("admin.detail.send")}</button></>}>
        {review && (
          <div className="space-y-3 text-sm">
            <select value={review.status} onChange={(e) => setReview({ ...review, status: e.target.value })} className="input-field !py-2">{[["approved", t("admin.detail.optApprove")], ["revision_requested", t("admin.detail.optRevision")], ["in_progress", t("admin.detail.optInProgress")], ["under_review", t("admin.detail.optUnderReview")]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <textarea value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} className="input-field" rows={4} placeholder={t("admin.detail.notePlaceholder")} />
            {user?.role === "professor" && <p className="text-xs text-gray-400">{t("admin.detail.reviewingAs", { name: user.name })}</p>}
          </div>
        )}
      </Modal>
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
