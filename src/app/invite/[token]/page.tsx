"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { setMeCache } from "@/components/useUser";
import { AuthNotice, AuthShell } from "@/components/accounts/AuthShell";
import { MIN_PASSWORD, PasswordField } from "@/components/accounts/PasswordField";
import { api, ApiError } from "@/lib/client";
import { useT } from "@/lib/i18n/client";

interface InviteInfo { email: string; university: string; role: "student" | "professor" | "admin"; expired: boolean; accepted: boolean }

export default function InvitePage() {
  const t = useT();
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InviteInfo | null | "invalid">(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InviteInfo>(`/api/invitations/${token}`).then(setInfo).catch(() => setInfo("invalid"));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError(t("accounts.invite.nameRequired"));
    if (password.length < MIN_PASSWORD) return setError(t("accounts.password.tooShort"));
    setLoading(true);
    try {
      const data = await api<{ user: { role: string } }>(`/api/invitations/${token}/accept`, { method: "POST", json: { name: name.trim(), password } });
      localStorage.setItem("user", JSON.stringify(data.user));
      setMeCache(null);
      router.push(data.user.role === "admin" || data.user.role === "professor" ? "/admin" : "/dashboard");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "expired") setInfo((i) => (i && i !== "invalid" ? { ...i, expired: true } : i));
      else if (code === "accepted") setInfo((i) => (i && i !== "invalid" ? { ...i, accepted: true } : i));
      else if (code === "email_taken") setError(t("accounts.invite.emailTaken"));
      else if (code === "password_short") setError(t("accounts.password.tooShort"));
      else if (code === "name_required") setError(t("accounts.invite.nameRequired"));
      else setError(t("common.error"));
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {info === null && <p className="text-sm text-gray-400">{t("common.loading")}…</p>}
      {info === "invalid" && <AuthNotice title={t("accounts.invite.invalid.title")} body={t("accounts.invite.invalid.body")} cta={t("common.signIn")} />}
      {info && info !== "invalid" && info.accepted && <AuthNotice title={t("accounts.invite.accepted.title")} body={t("accounts.invite.accepted.body")} cta={t("common.signIn")} />}
      {info && info !== "invalid" && !info.accepted && info.expired && <AuthNotice title={t("accounts.invite.expired.title")} body={t("accounts.invite.expired.body")} cta={t("common.signIn")} />}
      {info && info !== "invalid" && !info.accepted && !info.expired && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <h1 className="text-2xl font-bold mb-2">{t("accounts.invite.title")}</h1>
            <p className="text-gray-600 text-sm">{t("accounts.invite.lead", { university: info.university, role: t(`common.role.${info.role}`) })}</p>
          </div>
          {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1">{t("common.email")}</label>
            <input id="invite-email" type="email" value={info.email} readOnly className="input-field bg-gray-50 text-gray-600" />
            <p className="text-xs text-gray-400 mt-1">{t("accounts.invite.emailNote")}</p>
          </div>
          <div>
            <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1">{t("common.name")}</label>
            <input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder={t("accounts.invite.namePlaceholder")} required autoComplete="name" />
          </div>
          <PasswordField id="invite-password" value={password} onChange={setPassword} label={t("common.password")} />
          <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">{t("accounts.invite.consequence")}</p>
          <button type="submit" disabled={loading} className="btn-primary w-full !py-3 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? t("accounts.invite.submitting") : t("accounts.invite.submit")}</button>
        </form>
      )}
    </AuthShell>
  );
}
