"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

/** Public single-card layout shared by the invitation and password-reset pages (same chrome as /login). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-accent-500 rounded-lg flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-white" aria-hidden /></div>
          <span className="text-xl font-bold">Thesisfic<span className="text-brand-600">.edu</span></span>
        </Link>
        <LanguageSwitcher variant="inline" />
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}

/** Terminal states (expired, used, invalid) with a link back to sign in. */
export function AuthNotice({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-gray-600 text-sm mb-6">{body}</p>
      <Link href="/login" className="btn-outline !py-2 !px-4 text-sm">{cta}</Link>
    </div>
  );
}
