"use client";

import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Search } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import DatabaseCard, { ResearchDb } from "@/components/library/DatabaseCard";
import { api } from "@/lib/client";
import { useT } from "@/lib/i18n/client";

interface LibraryResponse {
  databases: ResearchDb[];
  settings: { intro?: string; helpEmail?: string; helpUrl?: string; proxyPrefix?: string };
  university: string;
}

export default function LibraryPage() {
  const t = useT();
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");

  useEffect(() => {
    api<LibraryResponse>("/api/research-databases").then(setData).catch(() => {});
  }, []);

  const subjects = useMemo(() => Array.from(new Set((data?.databases || []).flatMap((d) => d.subjects))).sort(), [data]);
  const list = (data?.databases || []).filter((d) => (subject === "all" || d.subjects.includes(subject)) && (!q || `${d.name} ${d.description} ${d.subjects.join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.library.title")}</h1>
          <p className="text-gray-500 mt-1 text-sm max-w-3xl">{data?.settings.intro || t("dashboard.library.intro", { university: data?.university || t("dashboard.library.yourUniversity") })}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input id="db-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dashboard.library.search")} className="input-field !py-2 !pl-9" aria-label={t("dashboard.library.search")} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...subjects].map((s) => (
              <button key={s} onClick={() => setSubject(s)} className={`px-3 py-1.5 text-xs rounded-full border ${subject === s ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                {s === "all" ? t("dashboard.library.allSubjects") : s}
              </button>
            ))}
          </div>
        </div>

        {!data ? (
          <div className="card p-10 text-center text-sm text-gray-400">{t("common.loading")}…</div>
        ) : list.length === 0 ? (
          <div className="card p-10 text-center text-sm text-gray-500">{data.databases.length ? t("dashboard.library.noMatch") : t("dashboard.library.noneListed")}</div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {list.map((d) => (
              <DatabaseCard key={d.id} d={d} university={data.university} proxyPrefix={data.settings.proxyPrefix} />
            ))}
          </div>
        )}

        {(data?.settings.helpEmail || data?.settings.helpUrl) && (
          <div className="card p-4 flex items-start gap-3 text-sm">
            <LifeBuoy className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">{t("dashboard.library.cantGetIn")}</div>
              <div className="text-gray-600">
                {t("dashboard.library.contact")}
                {data.settings.helpEmail && <> {t("dashboard.library.atEmail")} <span className="font-mono select-all">{data.settings.helpEmail}</span></>}
                {data.settings.helpUrl && <> · <a href={data.settings.helpUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">{t("dashboard.library.helpPage")}</a></>}
                .
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
