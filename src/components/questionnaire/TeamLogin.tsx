"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/landing/LandingNav";
import { useT } from "@/lib/i18n/client";

/** Password form for the team: sets the team cookie, then goes to `next` (results by default). */
export default function TeamLogin({ next }: { next: string }) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/equipe/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (res.status === 401) setError(t("q.login.wrong"));
      else if (res.status === 503) setError(t("q.login.notConfigured"));
      else if (!res.ok) setError(t("q.login.error"));
      else {
        router.push(next);
        router.refresh();
        return;
      }
    } catch {
      setError(t("q.login.error"));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="mx-auto max-w-[720px] px-4 sm:px-6 h-14 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <form onSubmit={submit} className="w-full max-w-[400px] bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          <h1 className="text-[20px] font-bold tracking-[-0.02em]">{t("q.login.title")}</h1>
          <p className="mt-2 text-[14px] text-gray-600">{t("q.login.help")}</p>
          <label htmlFor="team-password" className="block mt-6 mb-1 text-[13px] font-medium text-gray-700">
            {t("q.login.password")}
          </label>
          <input id="team-password" type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
          {error && (
            <p className="mt-3 text-[13px] text-red-600" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full mt-5" disabled={loading || !password}>
            {loading ? t("common.loading") : t("q.login.submit")}
          </button>
        </form>
      </main>
    </div>
  );
}
