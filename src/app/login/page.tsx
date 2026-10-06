"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { setMeCache } from "@/components/useUser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      localStorage.setItem("user", JSON.stringify(data.user));
      setMeCache(null);
      const next = params.get("next");
      if (next && next.startsWith("/")) router.push(next);
      else router.push(data.user.role === "admin" || data.user.role === "professor" ? "/admin" : "/dashboard");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const fillDemo = (type: "student" | "admin" | "professor") => {
    const creds = {
      student: { email: "jane.cooper@stanford.edu", password: "demo123" },
      admin: { email: "admin@stanford.edu", password: "admin123" },
      professor: { email: "prof.williams@stanford.edu", password: "demo123" },
    };
    setEmail(creds[type].email);
    setPassword(creds[type].password);
  };

  return (
    <div className="w-full max-w-md">
      <div className="lg:hidden mb-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-bold">Thesisfic<span className="text-brand-600">.edu</span></span>
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
      <p className="text-gray-500 mb-8">Sign in to continue to your dashboard</p>
      <div className="mb-6 p-4 bg-brand-50 rounded-xl">
        <p className="text-xs font-medium text-brand-700 mb-3">Quick demo access:</p>
        <div className="flex flex-wrap gap-2">
          {(["student", "professor", "admin"] as const).map((t) => (
            <button key={t} type="button" onClick={() => fillDemo(t)} className="px-3 py-1.5 text-xs font-medium bg-white rounded-lg text-brand-700 hover:bg-brand-100 transition-colors border border-brand-200 capitalize">{t} demo</button>
          ))}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="you@university.edu" required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Enter your password" required autoComplete="current-password" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full !py-3 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? "Signing in…" : "Sign In"}</button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        New to Thesisfic? <Link href="/register" className="text-brand-600 hover:text-brand-700 font-medium">Create a student account</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 to-brand-800 p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-white" /></div>
            <span className="text-2xl font-bold text-white">Thesisfic.edu</span>
          </Link>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold text-white mb-4 tracking-[-0.02em] leading-[1.15] [text-wrap:pretty]">Evidence of the writing process, not suspicion of the result.</h2>
          <p className="text-brand-100 text-lg max-w-[520px]">Every sentence is attributed as it is written: typed, quoted or AI-assisted. Your advisor reads the process, not just the draft.</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
