"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { setMeCache } from "@/components/useUser";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n/client";

const UNIVERSITIES = ["Stanford University", "Sorbonne University", "MIT", "University of Oxford", "Universidad Complutense de Madrid", "Universitat de Barcelona", "ETH Zürich", "Other"];

export default function RegisterPage() {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", university: UNIVERSITIES[0], other: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, email: form.email, password: form.password, university: form.university === "Other" ? form.other || "Other" : form.university }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.code === "email_exists" ? t("landing.register.errorExists") : data.code === "password_short" ? t("landing.register.errorPasswordShort") : data.code === "missing_fields" ? t("landing.register.errorMissing") : data.error || t("landing.register.errorFailed"));
        setLoading(false);
        return;
      }
      localStorage.setItem("user", JSON.stringify(data.user));
      setMeCache(null);
      router.push("/dashboard");
    } catch {
      setError(t("landing.register.errorNetwork"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative flex items-center justify-center p-6">
      <LanguageSwitcher variant="inline" className="absolute top-4 right-4" />
      <div className="w-full max-w-md card p-8">
        <Link href="/" className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-bold">Thesisfic<span className="text-brand-600">.edu</span></span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">{t("landing.register.title")}</h1>
        <p className="text-gray-500 text-sm mb-6">{t("landing.register.subtitle")}</p>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder={t("landing.register.fullName")} required />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="you@university.edu" required />
          <select value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} className="input-field">
            {UNIVERSITIES.map((u) => <option key={u} value={u}>{u === "Other" ? t("landing.register.other") : u}</option>)}
          </select>
          {form.university === "Other" && <input value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} className="input-field" placeholder={t("landing.register.universityName")} />}
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" placeholder={t("landing.register.passwordPlaceholder")} minLength={8} required />
          <button type="submit" disabled={loading} className="btn-primary w-full !py-3 disabled:opacity-50">{loading ? t("landing.register.submitting") : t("landing.register.submit")}</button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">{t("landing.register.already")} <Link href="/login" className="text-brand-600 font-medium">{t("common.signIn")}</Link></p>
      </div>
    </div>
  );
}
