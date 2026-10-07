"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export const MIN_PASSWORD = 8;

/** Password input with a show/hide toggle and the minimum-length hint. */
export function PasswordField({ id, value, onChange, label, autoComplete = "new-password", className = "" }: { id: string; value: string; onChange: (v: string) => void; label: string; autoComplete?: string; className?: string }) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} className="input-field pr-11" minLength={MIN_PASSWORD} required autoComplete={autoComplete} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t("accounts.password.hide") : t("accounts.password.show")} aria-pressed={show} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 rounded-md">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">{t("accounts.minPassword")}</p>
    </div>
  );
}
