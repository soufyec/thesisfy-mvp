"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { EmptyState } from "@/components/ui";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

interface Lead {
  id: string;
  institution: string;
  email: string;
  role: "integrity_office" | "dean" | "library" | "other";
  message?: string;
  createdAt: string;
}

/** Administrators: the pilot requests sent from the public site, newest first. */
export default function PilotRequestsPage() {
  const t = useT();
  const fmt = useFormat();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  useEffect(() => {
    api<{ leads: Lead[] }>("/api/leads").then((d) => setLeads(d.leads)).catch(() => setLeads([]));
  }, []);
  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("admin.leads.title")}</h1>
          <p className="text-gray-500 mt-1">{t("admin.leads.subtitle")}</p>
        </div>
        {leads === null ? (
          <div className="text-gray-400 text-sm">{t("common.loading")}…</div>
        ) : leads.length === 0 ? (
          <EmptyState title={t("admin.leads.empty")} />
        ) : (
          <div className="grid gap-3">
            {leads.map((l) => (
              <div key={l.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold break-words">{l.institution}</h2>
                  <span className="text-xs text-gray-400">{fmt.dateTime(l.createdAt)}</span>
                </div>
                <div className="mt-1 text-sm text-gray-600 break-words">
                  <a href={`mailto:${l.email}`} className="text-brand-600 hover:underline">{l.email}</a>
                  <span className="text-gray-400"> · {t(`admin.leads.role.${l.role}`)}</span>
                </div>
                {l.message && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">{l.message}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
