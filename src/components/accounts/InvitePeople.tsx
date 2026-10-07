"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Link2, X } from "lucide-react";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

type Role = "student" | "professor" | "admin";
const ROLES: Role[] = ["student", "professor", "admin"];
const ROLE_ALIASES: Record<string, Role> = { student: "student", professor: "professor", advisor: "professor", tutor: "professor", admin: "admin", administration: "admin" };
const MAX = 500;

export interface InvitationRow { id: string; email: string; role: Role; createdAt: string; expiresAt: string; acceptedAt?: string; status: "pending" | "accepted" | "expired"; link?: string }
type Skipped = { email: string; reason: "invalid" | "registered" | "invited" | "duplicate" | "role" };

/** `email` per line, `email,role` for an explicit role; commas, semicolons and whitespace all separate entries. */
export function parseInvites(text: string, defaultRole: Role): { email: string; role: Role }[] {
  const out: { email: string; role: Role }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!tokens.length) continue;
    const emails = tokens.filter((s) => s.indexOf("@") !== -1);
    const roleToken = tokens.map((s) => ROLE_ALIASES[s.toLowerCase()]).filter(Boolean)[0];
    for (const email of emails) out.push({ email: email.toLowerCase(), role: roleToken || defaultRole });
  }
  return out;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface InvitePeopleProps {
  onToast: (message: string, kind?: "info" | "success" | "error") => void;
  /** Secondary path: an account created by staff with a temporary password. Shown as a small link under the invite actions. */
  onCreateManually?: () => void;
}

export default function InvitePeople({ onToast, onCreateManually }: InvitePeopleProps) {
  const t = useT();
  const fmt = useFormat();
  const [text, setText] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<InvitationRow[]>([]);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  const load = useCallback(() => api<{ invitations: InvitationRow[] }>("/api/invitations").then((d) => setRows(d.invitations)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const parsed = useMemo(() => parseInvites(text, role), [text, role]);
  const pending = rows.filter((r) => r.status === "pending");
  const settled = rows.filter((r) => r.status !== "pending");

  const submit = async () => {
    if (!parsed.length) return onToast(t("accounts.admin.noEmails"), "error");
    if (parsed.length > MAX) return onToast(t("accounts.admin.tooMany"), "error");
    setBusy(true);
    setSkipped([]);
    try {
      const d = await api<{ invitations: InvitationRow[]; skipped: Skipped[] }>("/api/invitations", { method: "POST", json: { invites: parsed } });
      setSkipped(d.skipped);
      setText("");
      await load();
      if (d.invitations.length) onToast(t(d.invitations.length === 1 ? "accounts.admin.inviteCreated_one" : "accounts.admin.inviteCreated", { n: d.invitations.length }), "success");
      else onToast(t("accounts.admin.inviteNone"), "info");
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const copyOne = async (link: string) => {
    if (await copyText(link)) {
      setFallbackLink(null);
      onToast(t("accounts.admin.linkCopied"), "success");
    } else {
      setFallbackLink(link);
      onToast(t("accounts.admin.copyFailed"), "error");
    }
  };

  const copyAll = async () => {
    const lines = pending.filter((r) => r.link).map((r) => `${r.email}\t${r.link}`);
    if (!lines.length) return;
    if (await copyText(lines.join("\n"))) onToast(t("accounts.admin.linksCopied", { n: lines.length }), "success");
    else onToast(t("accounts.admin.copyFailed"), "error");
  };

  const revoke = async (id: string) => {
    try {
      await api(`/api/invitations/${id}`, { method: "DELETE" });
      setRows((rs) => rs.filter((r) => r.id !== id));
      onToast(t("accounts.admin.revoked"), "info");
    } catch (e) {
      onToast((e as Error).message, "error");
    }
  };

  const roleLabel = (r: Role) => t(`accounts.admin.role.${r}`);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6" aria-labelledby="invite-people-title">
      <h2 id="invite-people-title" className="font-semibold">{t("accounts.admin.inviteTitle")}</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">{t("accounts.admin.inviteSubtitle")}</p>
      <div className="grid sm:grid-cols-[1fr_200px] gap-3">
        <label className="text-xs text-gray-500">
          {t("accounts.admin.emailsLabel")}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="input-field !py-2 mt-1 font-mono text-xs resize-y" placeholder={t("accounts.admin.emailsPlaceholder")} spellCheck={false} />
        </label>
        <div className="space-y-3">
          <label className="text-xs text-gray-500 block">
            {t("accounts.admin.defaultRole")}
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input-field !py-2 mt-1">
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
          <div className="text-xs text-gray-400" aria-live="polite">{parsed.length ? t(parsed.length === 1 ? "accounts.admin.parsed_one" : "accounts.admin.parsed", { n: parsed.length }) : ""}</div>
        </div>
      </div>
      <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 mt-3">{t("accounts.admin.inviteConsequence")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} disabled={busy || !parsed.length} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"><Link2 className="w-4 h-4 mr-1" aria-hidden />{busy ? t("accounts.admin.inviteSubmitting") : t("accounts.admin.inviteSubmit")}</button>
        {pending.length > 1 && <button type="button" onClick={copyAll} className="btn-outline !py-2 !px-4 text-sm"><Copy className="w-4 h-4 mr-1" aria-hidden />{t("accounts.admin.copyAll")}</button>}
      </div>
      {onCreateManually && (
        <p className="text-xs text-gray-500 mt-3">
          <button type="button" onClick={onCreateManually} className="text-brand-600 hover:text-brand-700 font-medium underline-offset-2 hover:underline">{t("accounts.admin.manualCreate")}</button>
          <span className="ml-1">{t("accounts.admin.manualCreateHint")}</span>
        </p>
      )}
      {skipped.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mt-3">{t("accounts.admin.skipped", { list: skipped.map((s) => `${s.email} (${t(`accounts.admin.skip.${s.reason}`)})`).join(", ") })}</p>
      )}
      {fallbackLink && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <input readOnly value={fallbackLink} onFocus={(e) => e.currentTarget.select()} aria-label={t("accounts.admin.copyLink")} className="input-field !py-1.5 font-mono text-xs" />
          <button type="button" onClick={() => setFallbackLink(null)} className="btn-outline !py-1.5 !px-3 text-xs">{t("accounts.admin.hideLink")}</button>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">{t("accounts.admin.pendingTitle")} <span className="text-gray-400 font-normal">({pending.length})</span></h3>
        {pending.length === 0 && settled.length === 0 && <p className="text-sm text-gray-400">{t("accounts.admin.noInvitations")}</p>}
        <ul className="divide-y divide-gray-100">
          {pending.map((r) => (
            <li key={r.id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.email} <span className="badge bg-gray-100 text-gray-600 ml-1">{roleLabel(r.role)}</span></div>
                <div className="text-xs text-gray-400">{t("accounts.admin.invitedOn", { date: fmt.date(r.createdAt) })} · {t("accounts.admin.expires", { date: fmt.date(r.expiresAt) })}</div>
              </div>
              <div className="flex items-center gap-2">
                {r.link && <button type="button" onClick={() => copyOne(r.link!)} className="btn-outline !py-1.5 !px-3 text-xs"><Copy className="w-3.5 h-3.5 mr-1" aria-hidden />{t("accounts.admin.copyLink")}</button>}
                <button type="button" onClick={() => revoke(r.id)} title={t("accounts.admin.revokeConsequence")} aria-label={`${t("accounts.admin.revoke")}: ${r.email}`} className="btn-outline !py-1.5 !px-3 text-xs text-red-600 hover:!text-red-700"><X className="w-3.5 h-3.5 mr-1" aria-hidden />{t("accounts.admin.revoke")}</button>
              </div>
            </li>
          ))}
        </ul>
        {settled.length > 0 && (
          <>
            <h3 className="text-sm font-semibold mt-4 mb-2 text-gray-500">{t("accounts.admin.acceptedTitle")} <span className="text-gray-400 font-normal">({settled.length})</span></h3>
            <ul className="divide-y divide-gray-100">
              {settled.map((r) => (
                <li key={r.id} className="py-2 text-gray-400">
                  <div className="text-sm truncate">{r.email} <span className="badge bg-gray-50 text-gray-400 ml-1">{roleLabel(r.role)}</span></div>
                  <div className="text-xs">{r.status === "accepted" && r.acceptedAt ? t("accounts.admin.acceptedOn", { date: fmt.date(r.acceptedAt) }) : t("accounts.admin.expired", { date: fmt.date(r.expiresAt) })}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
