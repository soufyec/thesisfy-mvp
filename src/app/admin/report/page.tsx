"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Download, FileBarChart, FileText, Flag, PenLine, Printer, ShieldCheck, Users } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";
import { downloadBlob, htmlToDocx, toCsv, CsvCell } from "@/lib/export";
import { useFormat, useT } from "@/lib/i18n/client";
import { modeLabel, noticeTypeLabel, plural, statusLabel } from "@/lib/i18n/messages/admin";

type Preset = "last30" | "last90" | "year" | "custom";
type T = ReturnType<typeof useT>;

interface Report {
  meta: { university: string; scope: "institution" | "advisor"; from: string; to: string; generatedAt: string; generatedBy: string; currency: string; aiLimit: number; theses: number };
  adoption: {
    usersByRole: Record<string, number>; students: number; activeStudents: number; newStudents: number;
    theses: { total: number; active: number; created: number; submitted: number; underReview: number; byStatus: Record<string, number> };
    sessions: number; minutes: number; devices: Record<string, number>;
  };
  writing: {
    wordsWritten: number; documentWords: number;
    provenance: { human: { words: number; percent: number }; ai: { words: number; percent: number }; paste: { words: number; percent: number } };
    aiPercent: { mean: number; median: number }; histogram: { range: string; count: number }[]; aboveLimit: number; limit: number; avgIntegrity: number;
  };
  ai: {
    interactions: number; studentsUsingAi: number; byMode: Record<string, number>; byProvider: Record<string, number>; insertions: number; insertedWords: number;
    currency: string; institutionPays: boolean; cost: number;
    byFunding: Record<"institution" | "student" | "platform", { requests: number; cost: number }>;
    byModel: { id: string; label: string; backend: string; requests: number; cost: number; students: number }[];
    blockedByPolicy: number; copilotEnabled: boolean; copilotStudents: number; copilotInteractions: number;
  };
  notices: {
    total: number; open: number; resolved: number; byType: Record<string, { open: number; resolved: number }>; bySeverity: Record<string, { open: number; resolved: number }>;
    meanResolutionHours: number | null; resolutionSample: number; thesesWithOpenNotices: number;
    pastes: Record<"assistant" | "source" | "declared" | "unattributed", { count: number; words: number }>;
  };
  consent: { required: boolean; students: number; withConsent: number; withoutConsent: number; byScope: Record<string, number>; grants: number; revocations: number; sessionsWithConsent: number };
  process: { declarations: number; declarationsSigned: number; snapshots: number; reviewRuns: number; reviewComments: number; languageReviews: number; evidenceChecks: number; citationsVerified: number; thesesWithDeclaration: number };
  weekly: { week: string; words: number; sessions: number; interactions: number; notices: number }[];
}

interface Row { section: string; metric: string; key?: string; value: CsvCell; unit?: string }

const FUNDING: ("institution" | "student" | "platform")[] = ["institution", "student", "platform"];
const PASTES: ("assistant" | "source" | "declared" | "unattributed")[] = ["assistant", "source", "declared", "unattributed"];
const SCOPES = ["keystrokes", "paste", "aiInteractions", "tabActivity"];
const SEVERITIES = ["low", "medium", "high"];

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => day(new Date(Date.now() - n * 86400000));
function academicYearStart() {
  const now = new Date();
  const year = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${year}-09-01`;
}
function rangeFor(preset: Preset, from: string, to: string): { from: string; to: string } {
  if (preset === "last30") return { from: daysAgo(29), to: daysAgo(0) };
  if (preset === "last90") return { from: daysAgo(89), to: daysAgo(0) };
  if (preset === "year") return { from: academicYearStart(), to: daysAgo(0) };
  return { from, to };
}

/** One flat list of every figure in the report, shared by the CSV and the DOCX export. */
function flatten(r: Report, t: T, fmtDate: (d: string) => string): Row[] {
  const rows: Row[] = [];
  const add = (section: string, metric: string, value: CsvCell, unit = t("report.unit.count"), key?: string) => rows.push({ section, metric, key, value, unit });
  const S = {
    adoption: t("report.adoption.title"), writing: t("report.writing.title"), ai: t("report.ai.title"), notices: t("report.notices.title"),
    consent: t("report.consent.title"), process: t("report.process.title"), weekly: t("report.weekly.title"),
  };
  const a = r.adoption;
  add(S.adoption, t("report.adoption.students"), a.students);
  add(S.adoption, t("report.adoption.activeStudents"), a.activeStudents);
  add(S.adoption, t("report.adoption.newStudents"), a.newStudents);
  add(S.adoption, t("report.adoption.advisors"), a.usersByRole.professor || 0);
  add(S.adoption, t("report.adoption.admins"), a.usersByRole.admin || 0);
  add(S.adoption, t("report.adoption.theses"), a.theses.total);
  add(S.adoption, t("report.adoption.thesesActive"), a.theses.active);
  add(S.adoption, t("report.adoption.thesesCreated"), a.theses.created);
  add(S.adoption, t("report.adoption.thesesSubmitted"), a.theses.submitted);
  add(S.adoption, t("report.adoption.thesesUnderReview"), a.theses.underReview);
  Object.keys(a.theses.byStatus).forEach((k) => add(S.adoption, t("report.adoption.byStatus"), a.theses.byStatus[k], undefined, statusLabel(t, k)));
  add(S.adoption, t("report.adoption.sessions"), a.sessions);
  add(S.adoption, t("report.adoption.minutes"), a.minutes, t("report.unit.minutes"));
  Object.keys(a.devices).forEach((k) => add(S.adoption, t("report.adoption.devices"), a.devices[k], undefined, t(`report.adoption.device.${k}`)));

  const w = r.writing;
  add(S.writing, t("report.writing.wordsWritten"), w.wordsWritten, t("report.unit.words"));
  add(S.writing, t("report.writing.documentWords"), w.documentWords, t("report.unit.words"));
  add(S.writing, t("report.writing.provenance"), w.provenance.human.words, t("report.unit.words"), t("glossary.written"));
  add(S.writing, t("report.writing.provenance"), w.provenance.human.percent, t("report.unit.percent"), t("glossary.written"));
  add(S.writing, t("report.writing.provenance"), w.provenance.ai.words, t("report.unit.words"), t("glossary.aiAssisted"));
  add(S.writing, t("report.writing.provenance"), w.provenance.ai.percent, t("report.unit.percent"), t("glossary.aiAssisted"));
  add(S.writing, t("report.writing.provenance"), w.provenance.paste.words, t("report.unit.words"), t("glossary.quotedOrPasted"));
  add(S.writing, t("report.writing.provenance"), w.provenance.paste.percent, t("report.unit.percent"), t("glossary.quotedOrPasted"));
  add(S.writing, t("report.writing.aiMean"), w.aiPercent.mean, t("report.unit.percent"));
  add(S.writing, t("report.writing.aiMedian"), w.aiPercent.median, t("report.unit.percent"));
  w.histogram.forEach((h) => add(S.writing, t("report.writing.histogram"), h.count, undefined, t("report.writing.histogramRange", { range: h.range })));
  add(S.writing, t("report.writing.aboveLimit", { limit: w.limit }), w.aboveLimit);
  add(S.writing, t("report.writing.avgIntegrity"), w.avgIntegrity, t("report.unit.percent"));

  const ai = r.ai;
  add(S.ai, t("report.ai.interactions"), ai.interactions);
  add(S.ai, t("report.ai.studentsUsingAi"), ai.studentsUsingAi);
  Object.keys(ai.byMode).forEach((k) => add(S.ai, t("report.ai.byMode"), ai.byMode[k], undefined, modeLabel(t, k)));
  Object.keys(ai.byProvider).forEach((k) => add(S.ai, t("report.ai.byProvider"), ai.byProvider[k], undefined, k));
  add(S.ai, t("report.ai.insertions"), ai.insertions);
  add(S.ai, t("report.ai.insertedWords"), ai.insertedWords, t("report.unit.words"));
  add(S.ai, t("report.ai.cost"), ai.cost, ai.currency);
  FUNDING.forEach((k) => {
    add(S.ai, t("report.ai.byFunding"), ai.byFunding[k].requests, undefined, t(`report.ai.funding.${k}`));
    add(S.ai, t("report.ai.byFunding"), ai.byFunding[k].cost, ai.currency, t(`report.ai.funding.${k}`));
  });
  ai.byModel.forEach((m) => {
    add(S.ai, t("report.ai.byModel"), m.requests, undefined, m.label);
    add(S.ai, t("report.ai.byModel"), m.cost, ai.currency, m.label);
  });
  add(S.ai, t("report.ai.blocked"), ai.blockedByPolicy);
  add(S.ai, t("report.ai.copilotStudents"), ai.copilotStudents);
  add(S.ai, t("report.ai.copilotInteractions"), ai.copilotInteractions);

  const n = r.notices;
  add(S.notices, t("report.notices.opened"), n.total);
  add(S.notices, t("report.notices.open"), n.open);
  add(S.notices, t("report.notices.resolved"), n.resolved);
  Object.keys(n.byType).forEach((k) => {
    add(S.notices, `${t("report.notices.byType")} · ${t("report.notices.open")}`, n.byType[k].open, undefined, noticeTypeLabel(t, k));
    add(S.notices, `${t("report.notices.byType")} · ${t("report.notices.resolved")}`, n.byType[k].resolved, undefined, noticeTypeLabel(t, k));
  });
  SEVERITIES.forEach((k) => {
    add(S.notices, `${t("report.notices.bySeverity")} · ${t("report.notices.open")}`, n.bySeverity[k]?.open || 0, undefined, t(`admin.level.${k}`));
    add(S.notices, `${t("report.notices.bySeverity")} · ${t("report.notices.resolved")}`, n.bySeverity[k]?.resolved || 0, undefined, t(`admin.level.${k}`));
  });
  add(S.notices, t("report.notices.meanResolution"), n.meanResolutionHours, t("report.unit.hours"));
  add(S.notices, t("report.notices.thesesWithOpen"), n.thesesWithOpenNotices);
  PASTES.forEach((k) => {
    add(S.notices, t("report.notices.pastes"), n.pastes[k].count, undefined, t(`report.notices.paste.${k}`));
    add(S.notices, t("report.notices.pastes"), n.pastes[k].words, t("report.unit.words"), t(`report.notices.paste.${k}`));
  });

  const c = r.consent;
  add(S.consent, t("report.consent.required"), c.required ? t("common.yes") : t("common.no"), "");
  add(S.consent, t("report.consent.withConsent"), c.withConsent);
  add(S.consent, t("report.consent.withoutConsent"), c.withoutConsent);
  SCOPES.forEach((k) => add(S.consent, t("report.consent.byScope"), c.byScope[k] || 0, undefined, t(`report.consent.scope.${k}`)));
  add(S.consent, t("report.consent.grants"), c.grants);
  add(S.consent, t("report.consent.revocations"), c.revocations);
  add(S.consent, t("report.consent.sessionsWithConsent"), c.sessionsWithConsent);

  const p = r.process;
  add(S.process, t("report.process.declarations"), p.declarations);
  add(S.process, t("report.process.declarationsSigned"), p.declarationsSigned);
  add(S.process, t("report.process.thesesWithDeclaration"), p.thesesWithDeclaration);
  add(S.process, t("report.process.snapshots"), p.snapshots);
  add(S.process, t("report.process.reviewRuns"), p.reviewRuns);
  add(S.process, t("report.process.reviewComments"), p.reviewComments);
  add(S.process, t("report.process.languageReviews"), p.languageReviews);
  add(S.process, t("report.process.evidenceChecks"), p.evidenceChecks);
  add(S.process, t("report.process.citationsVerified"), p.citationsVerified);

  r.weekly.forEach((wk) => {
    const label = t("report.weekly.week", { date: fmtDate(wk.week) });
    add(S.weekly, t("report.weekly.words"), wk.words, t("report.unit.words"), label);
    add(S.weekly, t("report.weekly.sessions"), wk.sessions, undefined, label);
    add(S.weekly, t("report.weekly.interactions"), wk.interactions, undefined, label);
    add(S.weekly, t("report.weekly.notices"), wk.notices, undefined, label);
  });
  return rows;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Report as plain HTML (headings, paragraphs, one table per section) for the DOCX export. */
function reportHtml(r: Report, rows: Row[], t: T, header: { scope: string; period: string; generated: string }) {
  const sections: string[] = [];
  rows.forEach((row) => sections.indexOf(row.section) === -1 && sections.push(row.section));
  const table = (section: string) =>
    `<table><tr><th>${esc(t("report.csv.metric"))}</th><th>${esc(t("report.csv.key"))}</th><th>${esc(t("report.csv.value"))}</th><th>${esc(t("report.csv.unit"))}</th></tr>${rows
      .filter((x) => x.section === section)
      .map((x) => `<tr><td>${esc(x.metric)}</td><td>${esc(x.key || "")}</td><td>${x.value === null || x.value === undefined ? "—" : esc(String(x.value))}</td><td>${esc(x.unit || "")}</td></tr>`)
      .join("")}</table>`;
  return `<h1>${esc(t("report.page.title"))}</h1><p>${esc(r.meta.university)} · ${esc(header.scope)}</p><p>${esc(header.period)}</p><p>${esc(header.generated)}</p><p>${esc(t("report.page.intro"))}</p>${sections
    .map((s) => `<h2>${esc(s)}</h2>${table(s)}`)
    .join("")}<p>${esc(t("report.footer.note"))}</p>`;
}

function Section({ title, icon, children, help }: { title: string; icon: React.ReactNode; children: React.ReactNode; help?: string }) {
  return (
    <section className="card p-5 sm:p-6 report-section">
      <div className="flex items-center gap-2 mb-1">{icon}<h2 className="font-semibold">{title}</h2></div>
      {help && <p className="text-xs text-gray-500 mb-4">{help}</p>}
      {!help && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="p-3 bg-gray-50 rounded-xl min-w-0">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Bars({ rows, color = "bg-brand-500", empty }: { rows: { label: string; value: number; text?: string }[]; color?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="text-sm text-gray-400">{empty}</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm mb-1 gap-3"><span className="text-gray-600 truncate">{r.label}</span><span className="font-medium whitespace-nowrap">{r.text ?? r.value}</span></div>
          <div className="w-full bg-gray-100 rounded-full h-2"><div className={`${color} h-2 rounded-full`} style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function PilotReportPage() {
  const { user } = useUser();
  const t = useT();
  const fmt = useFormat();
  const [preset, setPreset] = useState<Preset>("last90");
  const [custom, setCustom] = useState({ from: daysAgo(89), to: daysAgo(0) });
  const [range, setRange] = useState(() => rangeFor("last90", "", ""));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api<{ report: Report }>(`/api/admin/report?from=${range.from}&to=${range.to}`)
      .then((d) => setReport(d.report))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range]);

  // Print styles target body.print-report (globals.css, "pilot report print").
  useEffect(() => {
    document.body.classList.add("print-report");
    return () => document.body.classList.remove("print-report");
  }, []);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(rangeFor(p, custom.from, custom.to));
  };

  const header = useMemo(() => {
    if (!report) return null;
    return {
      scope: report.meta.scope === "institution" ? t("report.page.scopeInstitution") : t("report.page.scopeAdvisor"),
      period: t("report.page.period", { from: fmt.date(report.meta.from + "T12:00:00Z"), to: fmt.date(report.meta.to + "T12:00:00Z") }),
      generated: t("report.page.generated", { date: fmt.dateTime(report.meta.generatedAt), name: report.meta.generatedBy }),
    };
  }, [report, t, fmt]);

  const rows = useMemo(() => (report ? flatten(report, t, (d) => fmt.date(d + "T12:00:00Z")) : []), [report, t, fmt]);
  const fileBase = report ? `thesisfic-pilot-report-${report.meta.from}-${report.meta.to}` : "thesisfic-pilot-report";

  const exportCsv = useCallback(() => {
    if (!report) return;
    const head: CsvCell[] = [t("report.csv.section"), t("report.csv.metric"), t("report.csv.key"), t("report.csv.value"), t("report.csv.unit")];
    const body = rows.map((r) => [r.section, r.metric, r.key || "", r.value, r.unit || ""] as CsvCell[]);
    downloadBlob(`${fileBase}.csv`, new Blob(["﻿" + toCsv([head, ...body])], { type: "text/csv;charset=utf-8" }));
  }, [report, rows, t, fileBase]);

  const exportDocx = useCallback(async () => {
    if (!report || !header) return;
    setExporting(true);
    try {
      const blob = await htmlToDocx(reportHtml(report, rows, t, header), { title: t("report.page.title"), author: user?.name });
      downloadBlob(`${fileBase}.docx`, blob);
    } finally {
      setExporting(false);
    }
  }, [report, rows, t, header, user, fileBase]);

  const r = report;
  const maxWeek = Math.max(1, ...(r?.weekly || []).map((w) => w.words));
  const labelEvery = r ? (r.weekly.length > 14 ? Math.ceil(r.weekly.length / 12) : 1) : 1;
  const num = (n: number) => fmt.number(n);
  const money = (n: number) => fmt.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasActivity = !!r && (r.adoption.sessions > 0 || r.ai.interactions > 0 || r.notices.total > 0 || r.process.snapshots > 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl pilot-report">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold">{t("report.page.title")}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t("report.page.subtitle", { university: user?.university || "" })}</p>
            {r && header && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                <span className="badge bg-brand-50 text-brand-700">{header.scope}</span>
                <span>{header.period}</span>
                <span>{plural(t, "report.page.thesesInScope", r.meta.theses)}</span>
                <span>{header.generated}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 report-controls">
            <label className="sr-only" htmlFor="report-period">{t("report.period.label")}</label>
            <select id="report-period" value={preset} onChange={(e) => choosePreset(e.target.value as Preset)} className="input-field !w-auto !py-2 !px-3 text-sm" aria-label={t("report.period.label")}>
              <option value="last30">{t("report.period.last30")}</option>
              <option value="last90">{t("report.period.last90")}</option>
              <option value="year">{t("report.period.academicYear")}</option>
              <option value="custom">{t("report.period.custom")}</option>
            </select>
            {preset === "custom" && (
              <>
                <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="input-field !w-auto !py-2 !px-3 text-sm" aria-label={t("report.period.from")} />
                <input type="date" value={custom.to} min={custom.from} max={daysAgo(0)} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="input-field !w-auto !py-2 !px-3 text-sm" aria-label={t("report.period.to")} />
                <button onClick={() => custom.from && custom.to && setRange({ from: custom.from, to: custom.to })} className="btn-outline !py-2 !px-4 text-sm">{t("report.period.apply")}</button>
              </>
            )}
            <span className="hidden sm:block w-px h-6 bg-gray-200 mx-1" />
            <button onClick={exportCsv} disabled={!r} className="btn-outline !py-2 !px-3 text-sm gap-1.5"><Download className="w-4 h-4" />{t("report.actions.csv")}</button>
            <button onClick={exportDocx} disabled={!r || exporting} className="btn-outline !py-2 !px-3 text-sm gap-1.5"><FileText className="w-4 h-4" />{exporting ? t("report.actions.exporting") : t("report.actions.docx")}</button>
            <button onClick={() => window.print()} disabled={!r} className="btn-primary !py-2 !px-3 text-sm gap-1.5"><Printer className="w-4 h-4" />{t("report.actions.print")}</button>
          </div>
        </div>

        <div className="card p-5 sm:p-6 mb-6 border-brand-100 bg-brand-50/40">
          <div className="flex items-start gap-3"><FileBarChart className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-gray-700 leading-relaxed">{t("report.page.intro")}</p></div>
        </div>

        {loading && <div className="p-12 text-center text-gray-400 text-sm">{t("report.page.loading")}…</div>}
        {!loading && error && <div className="card p-6 text-sm text-red-600">{t("report.page.error")}: {error}</div>}
        {!loading && r && !hasActivity && <div className="card p-6 mb-6 text-sm text-gray-500">{t("report.page.empty")}</div>}

        {!loading && r && (
          <div className="space-y-6">
            {/* Adoption */}
            <Section title={t("report.adoption.title")} icon={<Users className="w-4 h-4 text-gray-500" />}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Stat label={t("report.adoption.students")} value={num(r.adoption.students)} sub={`${t("report.adoption.advisors")} ${num(r.adoption.usersByRole.professor || 0)} · ${t("report.adoption.admins")} ${num(r.adoption.usersByRole.admin || 0)}`} />
                <Stat label={t("report.adoption.activeStudents")} value={num(r.adoption.activeStudents)} sub={t("report.adoption.activeStudentsHelp")} />
                <Stat label={t("report.adoption.sessions")} value={num(r.adoption.sessions)} sub={`${t("report.adoption.minutes")}: ${num(r.adoption.minutes)}`} />
                <Stat label={t("report.adoption.theses")} value={num(r.adoption.theses.total)} sub={`${t("report.adoption.thesesActive")} ${num(r.adoption.theses.active)} · ${t("report.adoption.thesesSubmitted")} ${num(r.adoption.theses.submitted)}`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.adoption.byStatus")}</h3>
                  <Bars rows={Object.keys(r.adoption.theses.byStatus).map((k) => ({ label: statusLabel(t, k), value: r.adoption.theses.byStatus[k] }))} empty={t("common.none")} />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.adoption.devices")}</h3>
                  <Bars rows={Object.keys(r.adoption.devices).map((k) => ({ label: t(`report.adoption.device.${k}`), value: r.adoption.devices[k] }))} empty={t("common.none")} />
                </div>
                <div className="grid grid-cols-2 gap-3 content-start">
                  <Stat label={t("report.adoption.newStudents")} value={num(r.adoption.newStudents)} />
                  <Stat label={t("report.adoption.thesesCreated")} value={num(r.adoption.theses.created)} />
                  <Stat label={t("report.adoption.thesesUnderReview")} value={num(r.adoption.theses.underReview)} />
                </div>
              </div>
            </Section>

            {/* Writing */}
            <Section title={t("report.writing.title")} icon={<PenLine className="w-4 h-4 text-gray-500" />} help={t("report.writing.provenanceHelp")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Stat label={t("report.writing.wordsWritten")} value={num(r.writing.wordsWritten)} />
                <Stat label={t("report.writing.documentWords")} value={num(r.writing.documentWords)} />
                <Stat label={t("report.writing.aiMean")} value={`${r.writing.aiPercent.mean}%`} sub={`${t("report.writing.aiMedian")}: ${r.writing.aiPercent.median}%`} />
                <Stat label={t("report.writing.aboveLimit", { limit: r.writing.limit })} value={num(r.writing.aboveLimit)} sub={`${t("report.writing.avgIntegrity")}: ${r.writing.avgIntegrity}%`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.writing.provenance")}</h3>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-3" role="img" aria-label={`${t("glossary.written")} ${r.writing.provenance.human.percent}%, ${t("glossary.aiAssisted")} ${r.writing.provenance.ai.percent}%, ${t("glossary.quotedOrPasted")} ${r.writing.provenance.paste.percent}%`}>
                    <div className="bg-prov-human" style={{ width: `${r.writing.provenance.human.percent}%` }} />
                    <div className="bg-prov-paste" style={{ width: `${r.writing.provenance.paste.percent}%` }} />
                    <div className="bg-prov-ai" style={{ width: `${r.writing.provenance.ai.percent}%` }} />
                  </div>
                  <div className="space-y-1.5 text-sm">
                    {([["human", "bg-prov-human", t("glossary.written")], ["paste", "bg-prov-paste", t("glossary.quotedOrPasted")], ["ai", "bg-prov-ai", t("glossary.aiAssisted")]] as const).map(([k, c, l]) => (
                      <div key={k} className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c}`} /><span className="flex-1 text-gray-600">{l}</span><span className="font-medium">{num(r.writing.provenance[k].words)} · {r.writing.provenance[k].percent}%</span></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.writing.histogram")}</h3>
                  <Bars rows={r.writing.histogram.map((h) => ({ label: t("report.writing.histogramRange", { range: h.range }), value: h.count, text: plural(t, "report.writing.theses", h.count) }))} color="bg-prov-ai" />
                </div>
              </div>
            </Section>

            {/* AI */}
            <Section title={t("report.ai.title")} icon={<Bot className="w-4 h-4 text-gray-500" />} help={t("report.ai.blockedHelp")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Stat label={t("report.ai.interactions")} value={num(r.ai.interactions)} sub={`${t("report.ai.studentsUsingAi")}: ${num(r.ai.studentsUsingAi)}`} />
                <Stat label={t("report.ai.insertions")} value={num(r.ai.insertions)} sub={`${t("report.ai.insertedWords")}: ${num(r.ai.insertedWords)}`} />
                <Stat label={t("report.ai.cost")} value={`${money(r.ai.cost)} ${r.ai.currency}`} sub={t("report.ai.costHelp", { currency: r.ai.currency })} />
                <Stat label={t("report.ai.blocked")} value={num(r.ai.blockedByPolicy)} sub={r.ai.copilotEnabled ? `${t("report.ai.copilotStudents")}: ${num(r.ai.copilotStudents)} · ${t("report.ai.copilotInteractions")}: ${num(r.ai.copilotInteractions)}` : t("report.ai.copilotOff")} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.ai.byMode")}</h3>
                  <Bars rows={Object.keys(r.ai.byMode).sort((a, b) => r.ai.byMode[b] - r.ai.byMode[a]).map((k) => ({ label: modeLabel(t, k), value: r.ai.byMode[k] }))} empty={t("report.ai.none")} />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.ai.byProvider")}</h3>
                  <Bars rows={Object.keys(r.ai.byProvider).sort((a, b) => r.ai.byProvider[b] - r.ai.byProvider[a]).map((k) => ({ label: k, value: r.ai.byProvider[k] }))} empty={t("report.ai.none")} />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.ai.byFunding")}</h3>
                  <Bars rows={FUNDING.map((k) => ({ label: t(`report.ai.funding.${k}`), value: r.ai.byFunding[k].requests, text: t("report.ai.fundingRow", { requests: num(r.ai.byFunding[k].requests), cost: money(r.ai.byFunding[k].cost), currency: r.ai.currency }) }))} color="bg-accent-500" />
                  <h3 className="text-xs font-medium text-gray-500 mb-2 mt-5">{t("report.ai.byModel")}</h3>
                  <Bars rows={r.ai.byModel.map((m) => ({ label: m.label, value: m.requests, text: t("report.ai.modelRow", { requests: num(m.requests), students: num(m.students), cost: money(m.cost), currency: r.ai.currency }) }))} color="bg-accent-500" empty={t("report.ai.noModels")} />
                </div>
              </div>
            </Section>

            {/* Notices */}
            <Section title={t("report.notices.title")} icon={<Flag className="w-4 h-4 text-gray-500" />} help={t("report.notices.pastesHelp")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <Stat label={t("report.notices.opened")} value={num(r.notices.total)} sub={t("report.notices.openResolved", { open: num(r.notices.open), resolved: num(r.notices.resolved) })} />
                <Stat label={t("report.notices.thesesWithOpen")} value={num(r.notices.thesesWithOpenNotices)} />
                <Stat label={t("report.notices.meanResolution")} value={r.notices.meanResolutionHours === null ? "—" : t("report.notices.meanResolutionValue", { hours: num(r.notices.meanResolutionHours) })} sub={r.notices.meanResolutionHours === null ? t("report.notices.meanResolutionNone") : t("report.notices.meanResolutionSample", { n: r.notices.resolutionSample })} />
                <Stat label={t("report.notices.paste.assistant")} value={num(r.notices.pastes.assistant.count)} sub={t("report.notices.pasteRow", { count: num(r.notices.pastes.assistant.count), words: num(r.notices.pastes.assistant.words) })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.notices.byType")}</h3>
                  <Bars rows={Object.keys(r.notices.byType).map((k) => ({ label: noticeTypeLabel(t, k), value: r.notices.byType[k].open + r.notices.byType[k].resolved, text: t("report.notices.openResolved", { open: r.notices.byType[k].open, resolved: r.notices.byType[k].resolved }) }))} color="bg-amber-500" empty={t("report.notices.none")} />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.notices.bySeverity")}</h3>
                  <Bars rows={SEVERITIES.map((k) => ({ label: t(`admin.level.${k}`), value: (r.notices.bySeverity[k]?.open || 0) + (r.notices.bySeverity[k]?.resolved || 0), text: t("report.notices.openResolved", { open: r.notices.bySeverity[k]?.open || 0, resolved: r.notices.bySeverity[k]?.resolved || 0 }) }))} color="bg-amber-500" />
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.notices.pastes")}</h3>
                  <Bars rows={PASTES.map((k) => ({ label: t(`report.notices.paste.${k}`), value: r.notices.pastes[k].count, text: t("report.notices.pasteRow", { count: num(r.notices.pastes[k].count), words: num(r.notices.pastes[k].words) }) }))} color="bg-prov-paste" />
                </div>
              </div>
            </Section>

            {/* Consent + Process */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title={t("report.consent.title")} icon={<ShieldCheck className="w-4 h-4 text-gray-500" />}>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <Stat label={t("report.consent.withConsent")} value={num(r.consent.withConsent)} sub={t("report.consent.of", { n: num(r.consent.students) })} />
                  <Stat label={t("report.consent.withoutConsent")} value={num(r.consent.withoutConsent)} sub={`${t("report.consent.required")}: ${r.consent.required ? t("common.yes") : t("common.no")}`} />
                  <Stat label={t("report.consent.grants")} value={num(r.consent.grants)} sub={`${t("report.consent.revocations")}: ${num(r.consent.revocations)}`} />
                  <Stat label={t("report.consent.sessionsWithConsent")} value={num(r.consent.sessionsWithConsent)} sub={t("report.consent.of", { n: num(r.adoption.sessions) })} />
                </div>
                <h3 className="text-xs font-medium text-gray-500 mb-2">{t("report.consent.byScope")}</h3>
                <Bars rows={SCOPES.map((k) => ({ label: t(`report.consent.scope.${k}`), value: r.consent.byScope[k] || 0, text: `${num(r.consent.byScope[k] || 0)} ${t("report.consent.of", { n: num(r.consent.students) })}` }))} color="bg-accent-500" />
              </Section>

              <Section title={t("report.process.title")} icon={<FileText className="w-4 h-4 text-gray-500" />} help={t("report.process.snapshotsHelp")}>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label={t("report.process.declarations")} value={num(r.process.declarations)} sub={`${t("report.process.declarationsSigned")}: ${num(r.process.declarationsSigned)} · ${t("report.process.thesesWithDeclaration")}: ${num(r.process.thesesWithDeclaration)}`} />
                  <Stat label={t("report.process.snapshots")} value={num(r.process.snapshots)} />
                  <Stat label={t("report.process.reviewRuns")} value={num(r.process.reviewRuns)} sub={`${t("report.process.reviewComments")}: ${num(r.process.reviewComments)}`} />
                  <Stat label={t("report.process.languageReviews")} value={num(r.process.languageReviews)} />
                  <Stat label={t("report.process.evidenceChecks")} value={num(r.process.evidenceChecks)} />
                  <Stat label={t("report.process.citationsVerified")} value={num(r.process.citationsVerified)} />
                </div>
              </Section>
            </div>

            {/* Weekly */}
            <Section title={t("report.weekly.title")} icon={<FileBarChart className="w-4 h-4 text-gray-500" />} help={t("report.weekly.help")}>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1 sm:gap-2 h-48 min-w-[480px]" role="img" aria-label={t("report.weekly.title")}>
                  {r.weekly.map((w, i) => (
                    <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={t("report.weekly.bar", { date: fmt.date(w.week + "T12:00:00Z"), words: num(w.words), sessions: num(w.sessions), interactions: num(w.interactions), notices: num(w.notices) })}>
                      <div className="w-full flex flex-col items-center justify-end h-32"><div className="text-[10px] text-gray-400 mb-1">{w.words ? num(w.words) : ""}</div><div className="w-full bg-brand-500 rounded-t-md" style={{ height: `${(w.words / maxWeek) * 100}%` }} /></div>
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">{i % labelEvery === 0 ? fmt.date(w.week + "T12:00:00Z", { day: "numeric", month: "short" }) : ""}</span>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{w.interactions || w.notices ? `${w.interactions} · ${w.notices}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 text-[11px] text-gray-500 mt-2"><span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-brand-500 mr-1 align-middle" />{t("report.weekly.words")}</span><span>{t("report.weekly.interactions")} · {t("report.weekly.notices")}</span></div>
            </Section>

            <p className="text-xs text-gray-500">{t("report.footer.note")}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
