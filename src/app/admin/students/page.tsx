"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api, timeAgo } from "@/lib/client";

interface Student { id: string; name: string; email: string; university: string; theses: number; avgIntegrity: number; avgAiUsage: number; openFlags: number; sessions: number; connections: string[]; consent: boolean; activeNow: boolean; lastActiveAt?: string }

export default function StudentsPage() {
  const { user } = useUser();
  const [students, setStudents] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "student" });
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api<{ students: Student[] }>("/api/users").then((d) => setStudents(d.students)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const invite = async () => {
    setError("");
    try {
      const d = await api<{ user: { email: string }; temporaryPassword: string }>("/api/users", { method: "POST", json: form });
      setCreated({ email: d.user.email, temporaryPassword: d.temporaryPassword });
      setForm({ name: "", email: "", role: "student" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Students</h1><p className="text-gray-500 mt-1 text-sm">Accounts, consent status and connected AI providers.</p></div>
          <button onClick={() => { setOpen(true); setCreated(null); }} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />Invite</button>
        </div>
        <div className="grid gap-3">
          {students.map((s) => (
            <div key={s.id} className="card p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-semibold flex-shrink-0">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
                  <div className="min-w-0"><div className="font-semibold flex items-center gap-2">{s.name}{s.activeNow && <span className="badge-success !text-[10px]">writing now</span>}</div><div className="text-sm text-gray-500 truncate">{s.email}</div><div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap"><span>{s.lastActiveAt ? `active ${timeAgo(s.lastActiveAt)}` : "never active"}</span><span>· {s.sessions} sessions</span><span>· consent {s.consent ? "✓" : "✗"}</span>{s.connections.length > 0 && <span>· own AI: {s.connections.join(", ")}</span>}</div></div>
                </div>
                <div className="flex items-center gap-6 sm:gap-8 text-center">
                  <div><div className="text-lg font-bold">{s.theses}</div><div className="text-xs text-gray-400">Theses</div></div>
                  <div><div className={`text-lg font-bold ${s.avgIntegrity >= 90 ? "text-green-600" : s.avgIntegrity >= 70 ? "text-amber-600" : "text-red-600"}`}>{s.avgIntegrity}%</div><div className="text-xs text-gray-400">Integrity</div></div>
                  <div><div className="text-lg font-bold text-purple-600">{s.avgAiUsage}%</div><div className="text-xs text-gray-400">AI</div></div>
                  <div><div className={`text-lg font-bold ${s.openFlags ? "text-amber-600" : "text-gray-300"}`}>{s.openFlags}</div><div className="text-xs text-gray-400">Flags</div></div>
                </div>
              </div>
            </div>
          ))}
          {students.length === 0 && <div className="card p-10 text-center text-sm text-gray-400">No students at {user?.university} yet.</div>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite to Thesisfic" size="sm" footer={created ? <button onClick={() => setOpen(false)} className="btn-primary !py-2 !px-4 text-sm">Done</button> : <><button onClick={() => setOpen(false)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button disabled={!form.name || !form.email} onClick={invite} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">Create account</button></>}>
        {created ? (
          <div className="text-sm space-y-2"><p>Account created for <strong>{created.email}</strong>. Share this temporary password securely (shown once):</p><div className="font-mono text-lg bg-gray-900 text-white rounded-xl px-4 py-2 text-center">{created.temporaryPassword}</div></div>
        ) : (
          <div className="space-y-3">
            {error && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl">{error}</div>}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field !py-2" placeholder="Full name" />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field !py-2" placeholder="Email" />
            {user?.role === "admin" && <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field !py-2"><option value="student">Student</option><option value="professor">Professor / advisor</option></select>}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
