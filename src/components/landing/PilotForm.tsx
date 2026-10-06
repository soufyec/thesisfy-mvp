"use client";

import { useState } from "react";

const ROLES = [
  { value: "integrity_office", label: "Integrity office" },
  { value: "dean", label: "Dean" },
  { value: "library", label: "Library" },
];

const FIELD = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors";
const LABEL = "flex flex-col gap-1.5 text-[13px] font-semibold text-gray-700";

export default function PilotForm() {
  const [institution, setInstitution] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLES[0].value);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution, email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "We could not record your request. Try again in a moment.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Network error. Check your connection and try again.");
      setStatus("idle");
    }
  };

  if (status === "sent") {
    return (
      <div className="bg-white text-gray-900 rounded-2xl p-7 shadow-[0_25px_50px_-12px] shadow-black/25 flex items-center min-h-[280px]" role="status">
        <p className="text-[16px] leading-[1.6] text-gray-700 m-0">Thanks. We will reply from a thesisfic.edu address within two working days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white text-gray-900 rounded-2xl p-7 shadow-[0_25px_50px_-12px] shadow-black/25 flex flex-col gap-3.5" noValidate>
      <label htmlFor="pilot-institution" className={LABEL}>
        Institution
        <input id="pilot-institution" name="institution" type="text" className={FIELD} placeholder="University of …" value={institution} onChange={(e) => setInstitution(e.target.value)} required autoComplete="organization" />
      </label>
      <label htmlFor="pilot-email" className={LABEL}>
        Work email
        <input id="pilot-email" name="email" type="email" className={FIELD} placeholder="name@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label htmlFor="pilot-role" className={LABEL}>
        Role
        <select id="pilot-role" name="role" className={FIELD} value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={status === "sending"} className="btn-primary mt-1.5 w-full !py-3.5 !text-[15px] !shadow-[0_10px_20px_-8px] !shadow-brand-600/50 disabled:opacity-60 disabled:cursor-not-allowed">
        {status === "sending" ? "Sending…" : "Request a pilot"}
      </button>
      {error && (
        <p className="text-[12px] text-red-600 m-0" role="alert">
          {error}
        </p>
      )}
      <p className="text-[12px] text-gray-500 text-center m-0">Pilots are scoped per department. No public pricing yet.</p>
    </form>
  );
}
