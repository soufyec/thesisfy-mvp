"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { setMeCache } from "@/components/useUser";

const UNIVERSITIES = ["Stanford University", "Sorbonne University", "MIT", "University of Oxford", "Universidad Complutense de Madrid", "Universitat de Barcelona", "ETH Zürich", "Other"];

export default function RegisterPage() {
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
        setError(data.error || "Could not create the account");
        setLoading(false);
        return;
      }
      localStorage.setItem("user", JSON.stringify(data.user));
      setMeCache(null);
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md card p-8">
        <Link href="/" className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-bold">Thesisfic<span className="text-brand-600">.edu</span></span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">Create your student account</h1>
        <p className="text-gray-500 text-sm mb-6">Your institution&apos;s AI policy applies automatically.</p>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Full name" required />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field" placeholder="you@university.edu" required />
          <select value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} className="input-field">
            {UNIVERSITIES.map((u) => <option key={u}>{u}</option>)}
          </select>
          {form.university === "Other" && <input value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} className="input-field" placeholder="University name" />}
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" placeholder="Password (min. 6 characters)" minLength={6} required />
          <button type="submit" disabled={loading} className="btn-primary w-full !py-3 disabled:opacity-50">{loading ? "Creating…" : "Create account"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-500">Already registered? <Link href="/login" className="text-brand-600 font-medium">Sign in</Link></p>
      </div>
    </div>
  );
}
