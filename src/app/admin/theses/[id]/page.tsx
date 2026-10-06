"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bot, CheckCircle2, ExternalLink, FileText, Flag, Monitor, Smartphone } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal, ScoreRing, Toast } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api, statusColors, statusLabels, timeAgo } from "@/lib/client";

interface Detail {
  thesis: { id: string; title: string; description: string; status: string; wordCount: number; targetWords: number; aiUsagePercent: number; integrityScore: number; provenance: { human: number; paste: number; ai: number }; studentName: string; professorName: string; updatedAt: string; deadline?: string; citationStyle: string; createdAt: string };
  comments: { id: string; authorName: string; text: string; resolved: boolean; createdAt: string; quote: string }[];
  flags: { id: string; type: string; severity: string; description: string; timestamp: string; resolved: boolean; resolvedBy?: string; resolutionNote?: string }[];
  versionCount: number;
  policy: { maxAiUsagePercent: number };
  interactions: { id: string; provider: string; model: string; mode: string; source: string; promptPreview: string; responsePreview: string; insertedWords: number; blockedByPolicy: boolean; timestamp: string }[];
}
interface Session { id: string; startedAt: string; endedAt?: string; lastHeartbeatAt: string; wordsWritten: number; aiAssists: number; keystrokes: number; pasteEvents: number; tabSwitches: number; device: string; consentId?: string; events: { id: string; type: string; timestamp: string; data: Record<string, unknown> }[]; integrityFlags: { id: string }[] }

export default function AdminThesisDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useUser();
  const [d, setD] = useState<Detail | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [resolve, setResolve] = useState<{ id: string; note: string } | null>(null);
  const [review, setReview] = useState<{ status: string; note: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/theses/${params.id}`).then(setD).catch(() => {});
    api<{ sessions: Session[] }>(`/api/theses/${params.id}/sessions`).then((r) => setSessions(r.sessions)).catch(() => {});
  }, [params.id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!d) return <DashboardLayout><div className="text-gray-400 text-sm">Loading…</div></DashboardLayout>;
  const t = d.thesis;
  const total = Math.max(1, t.provenance.human + t.provenance.paste + t.provenance.ai);
  const pct = (n: number) => Math.round((n / total) * 100);
  const duration = (s: Session) => Math.max(1, Math.round((new Date(s.endedAt || s.lastHeartbeatAt).getTime() - new Date(s.startedAt).getTime()) / 60000));

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-6xl">
        <div className="text-xs text-gray-400 mb-2"><Link href="/admin/theses" className="hover:text-brand-600">All theses</Link> / {t.studentName}</div>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
          <div className="min-w-0"><h1 className="text-2xl font-bold">{t.title}</h1><p className="text-gray-500 mt-1 text-sm">{t.description}</p><div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-gray-500"><span className={statusColors[t.status]}>{statusLabels[t.status]}</span><span>{t.studentName}</span><span>· Advisor {t.professorName}</span><span>· {t.wordCount.toLocaleString()} / {t.targetWords.toLocaleString()} words</span><span>· {t.citationStyle}</span>{t.deadline && <span>· due {new Date(t.deadline).toLocaleDateString()}</span>}<span>· updated {timeAgo(t.updatedAt)}</span></div></div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ScoreRing value={t.integrityScore} size={64} />
            <Link href={`/admin/theses/${t.id}/document`} className="btn-primary !py-2 !px-4 text-sm"><FileText className="w-4 h-4 mr-1" />Open document</Link>
            <button onClick={() => setReview({ status: t.status === "under_review" ? "approved" : "revision_requested", note: "" })} className="btn-outline !py-2 !px-4 text-sm">Review decision</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-semibold mb-3">Provenance report</h2>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 mb-2"><div className="bg-green-500" style={{ width: `${pct(t.provenance.human)}%` }} /><div className="bg-amber-400" style={{ width: `${pct(t.provenance.paste)}%` }} /><div className="bg-purple-500" style={{ width: `${pct(t.provenance.ai)}%` }} /></div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-green-600 font-bold text-lg">{pct(t.provenance.human)}%</div><div className="text-xs text-gray-500">typed by the student ({t.provenance.human.toLocaleString()} w)</div></div>
              <div><div className="text-amber-500 font-bold text-lg">{pct(t.provenance.paste)}%</div><div className="text-xs text-gray-500">pasted / quoted ({t.provenance.paste.toLocaleString()} w)</div></div>
              <div><div className={`font-bold text-lg ${pct(t.provenance.ai) > d.policy.maxAiUsagePercent ? "text-red-600" : "text-purple-600"}`}>{pct(t.provenance.ai)}%</div><div className="text-xs text-gray-500">AI-assisted ({t.provenance.ai.toLocaleString()} w) · limit {d.policy.maxAiUsagePercent}%</div></div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Provenance comes from the editor&apos;s insertion marks and paste attribution, including sentences recognised from the student&apos;s assistant and Research copilot answers, not from a statistical AI detector. Open the document to see highlights in context.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3"><Flag className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">Integrity flags</h2></div>
            {d.flags.length === 0 && <div className="text-sm text-gray-400">No flags.</div>}
            <div className="space-y-2">
              {d.flags.map((f) => (
                <div key={f.id} className={`p-2.5 rounded-xl border text-xs ${f.resolved ? "border-gray-100 opacity-60" : f.severity === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                  <div className="flex items-center gap-2 mb-1"><span className={`badge ${f.severity === "high" ? "badge-danger" : f.severity === "medium" ? "badge-warning" : "badge-info"} !text-[10px]`}>{f.severity}</span><span className="font-medium capitalize">{f.type.replace(/_/g, " ")}</span><span className="ml-auto text-gray-400">{timeAgo(f.timestamp)}</span></div>
                  <div className="text-gray-700 whitespace-pre-wrap">{f.description}</div>
                  {f.resolved ? <div className="text-green-700 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Resolved{f.resolutionNote ? `: ${f.resolutionNote}` : ""}</div> : <button onClick={() => setResolve({ id: f.id, note: "" })} className="mt-1.5 text-brand-600 hover:underline">Resolve…</button>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">Writing sessions ({sessions.length})</h2><p className="text-xs text-gray-400 mt-0.5">Only what the student consented to is shown.</p></div>
            <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {sessions.length === 0 && <div className="p-6 text-sm text-gray-400">No sessions recorded yet.</div>}
              {sessions.map((s) => (
                <div key={s.id} className="p-4 text-sm">
                  <button onClick={() => setOpen(open === s.id ? null : s.id)} className="w-full text-left">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{new Date(s.startedAt).toLocaleString()}</span><span className="text-xs text-gray-400">{duration(s)} min</span>{s.device === "mobile" ? <Smartphone className="w-3.5 h-3.5 text-gray-400" /> : <Monitor className="w-3.5 h-3.5 text-gray-400" />}{!s.endedAt && Date.now() - new Date(s.lastHeartbeatAt).getTime() < 5 * 60 * 1000 && <span className="badge-success !text-[10px]">live</span>}{!s.consentId && <span className="badge bg-gray-100 text-gray-500 !text-[10px]">no consent record</span>}{s.integrityFlags.length > 0 && <span className="badge-warning !text-[10px]">{s.integrityFlags.length} flag</span>}</div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap"><span>{s.wordsWritten} words</span><span>{s.keystrokes.toLocaleString()} keys</span><span>{s.aiAssists} AI</span><span>{s.pasteEvents} pastes</span><span>{s.tabSwitches} tab switches</span></div>
                  </button>
                  {open === s.id && (
                    <ul className="mt-2 pl-3 border-l border-gray-100 space-y-1 text-xs text-gray-600 max-h-48 overflow-y-auto">
                      {s.events.length === 0 && <li className="text-gray-400">No events.</li>}
                      {s.events.slice(-60).map((e) => (
                        <li key={e.id}><span className="text-gray-400">{new Date(e.timestamp).toLocaleTimeString()}</span> <span className="font-medium capitalize">{e.type.replace(/_/g, " ")}</span> <span className="text-gray-500">{Object.entries(e.data).filter(([k]) => !["fingerprint", "interactionId", "flagId", "reportedAt"].includes(k)).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ")}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2"><Bot className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">AI interaction log ({d.interactions.length})</h2></div>
            <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
              {d.interactions.length === 0 && <div className="p-6 text-sm text-gray-400">No AI use logged.</div>}
              {d.interactions.map((i) => (
                <div key={i.id} className="p-4 text-sm">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-medium capitalize">{i.mode.replace("_", " ")}</span><span className="text-xs text-gray-400">{i.provider} · {i.model}</span>{i.mode === "copilot" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px]">copilot</span>}{i.blockedByPolicy && <span className="badge-danger !text-[10px]">blocked</span>}{i.insertedWords > 0 && <span className="badge bg-purple-50 text-purple-700 !text-[10px]">{i.insertedWords} words inserted</span>}<span className="ml-auto text-[11px] text-gray-400">{timeAgo(i.timestamp)}</span></div>
                  <div className="text-gray-700 mt-1"><span className="text-gray-400">Prompt:</span> {i.promptPreview}</div>
                  {i.responsePreview && <div className="text-gray-500 text-xs mt-0.5 truncate"><span className="text-gray-400">Reply:</span> {i.responsePreview}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card mt-6">
          <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">Comments ({d.comments.length})</h2></div>
          <div className="divide-y divide-gray-50">
            {d.comments.length === 0 && <div className="p-6 text-sm text-gray-400">No comments yet. Open the document to add some.</div>}
            {d.comments.map((c) => <div key={c.id} className="p-4 text-sm"><div className="flex items-center gap-2"><span className="font-medium">{c.authorName}</span><span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>{c.resolved && <span className="badge-success !text-[10px]">resolved</span>}</div>{c.quote && <div className="text-xs text-gray-400 border-l-2 border-amber-300 pl-2 my-1">{c.quote}</div>}<div>{c.text}</div></div>)}
          </div>
        </div>
      </div>

      <Modal open={!!resolve} onClose={() => setResolve(null)} title="Resolve flag" size="sm" footer={<><button onClick={() => setResolve(null)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={async () => { if (!resolve) return; await api(`/api/flags/${resolve.id}`, { method: "PATCH", json: { note: resolve.note } }).catch(() => {}); setResolve(null); setToast({ message: "Flag resolved; the student was notified.", kind: "success" }); load(); }} className="btn-primary !py-2 !px-4 text-sm">Resolve</button></>}>
        <textarea autoFocus value={resolve?.note || ""} onChange={(e) => setResolve(resolve && { ...resolve, note: e.target.value })} className="input-field" rows={3} placeholder="Resolution note (visible to the student)" />
      </Modal>
      <Modal open={!!review} onClose={() => setReview(null)} title="Review decision" size="sm" footer={<><button onClick={() => setReview(null)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={async () => { if (!review) return; await api(`/api/theses/${t.id}`, { method: "PUT", json: { status: review.status, reviewNote: review.note } }).catch((e) => setToast({ message: (e as Error).message, kind: "error" })); setReview(null); setToast({ message: "Decision recorded and the student notified.", kind: "success" }); load(); }} className="btn-primary !py-2 !px-4 text-sm">Send</button></>}>
        {review && (
          <div className="space-y-3 text-sm">
            <select value={review.status} onChange={(e) => setReview({ ...review, status: e.target.value })} className="input-field !py-2">{[["approved", "Approve"], ["revision_requested", "Request revision"], ["in_progress", "Back to in progress"], ["under_review", "Mark under review"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <textarea value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} className="input-field" rows={4} placeholder="Note to the student" />
            {user?.role === "professor" && <p className="text-xs text-gray-400">You are reviewing as advisor {user.name}.</p>}
          </div>
        )}
      </Modal>
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
