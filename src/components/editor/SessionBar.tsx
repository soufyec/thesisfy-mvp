"use client";

import { CalendarClock, ShieldCheck, StickyNote } from "lucide-react";
import type { ConsentScopes } from "../useUser";
import { useFormat, useT } from "@/lib/i18n/client";
import { richText } from "./types";
import { deadlineState } from "@/lib/deadline";
import { DEADLINE_TEXT, useDeadlineLabel } from "../ui";

interface Props {
  /** True while a writing session is recording for the owner. */
  sessionActive: boolean;
  /** The scopes the student granted; null when no session or consent is known. */
  scopes: ConsentScopes | null;
  /** Opens the consent dialog. */
  onChange: () => void;
  /** Whether the viewer is the student who owns the thesis. */
  isOwner: boolean;
  reviewMode?: boolean;
  status: string;
  advisorName?: string;
  words: number;
  targetWords: number;
  /** Estimated page count of the open tab (about 350 words a page). */
  pages: number;
  citationStyle: string;
  zoom: number;
  onWordCount: () => void;
  /** Thesis deadline (ISO); the chip shows the days left and opens the deadline dialog for the owner. */
  deadline?: string;
  onDeadline?: () => void;
  /** Shown instead of the recording phrase while a working tab (not the Final submission) is open. */
  workingTab?: { title: string; onGoToSubmission: () => void } | null;
}

const SCOPE_WORDS: { key: keyof ConsentScopes; label: string }[] = [
  { key: "paste", label: "editor.session.scope.paste" },
  { key: "aiInteractions", label: "editor.session.scope.aiInteractions" },
  { key: "tabActivity", label: "editor.session.scope.tabActivity" },
  { key: "keystrokes", label: "editor.session.scope.keystrokes" },
];

function joinList(items: string[], and: string) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

/**
 * Session bar (30px, bottom of the editor): what the current session records, in the student's own consent
 * terms, and the document facts an advisor glances at (status, words, page, citation style).
 */
export default function SessionBar({ sessionActive, scopes, onChange, isOwner, reviewMode, status, advisorName, words, targetWords, pages, citationStyle, zoom, onWordCount, deadline, onDeadline, workingTab }: Props) {
  const t = useT();
  const fmt = useFormat();
  const deadlineLabel = useDeadlineLabel();
  const dl = deadlineState(deadline, words, targetWords);
  const granted = scopes ? SCOPE_WORDS.filter((s) => scopes[s.key]).map((s) => t(s.label)) : [];
  const finalSubmission = t("glossary.finalSubmission");
  const recording = sessionActive && scopes;

  let left: React.ReactNode;
  if (workingTab) {
    left = (
      <span className="flex items-center gap-2 min-w-0">
        <StickyNote className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        <span className="truncate">
          {richText(t("editor.session.workingTab", { finalSubmission }), { title: <b className="font-semibold text-gray-900">{workingTab.title}</b> })}
        </span>
        <button onClick={workingTab.onGoToSubmission} className="underline decoration-dotted hover:text-gray-900 flex-shrink-0">{t("editor.session.goToSubmission", { finalSubmission })}</button>
      </span>
    );
  } else if (reviewMode && !isOwner) {
    left = (
      <span className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
        <span className="truncate">{t("editor.session.reviewMode")}</span>
      </span>
    );
  } else if (!isOwner) {
    left = <span className="truncate">{t("editor.session.readOnlyView")}</span>;
  } else {
    left = (
      <span className="flex items-center gap-[7px] min-w-0">
        <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${recording ? "bg-green-500 session-dot" : "bg-gray-300"}`} />
        <span className="truncate">
          {recording ? (
            granted.length ? (
              <>
                {richText(t("editor.session.recording"), { list: <b className="font-semibold text-gray-900">{joinList(granted, t("editor.session.and"))}</b> })}
                {!scopes.keystrokes && t("editor.session.notKeystrokes")}
              </>
            ) : (
              <>{richText(t("editor.session.activeNothing"), { recordingNothing: <b className="font-semibold text-gray-900">{t("editor.session.recordingNothing")}</b> })}</>
            )
          ) : (
            t("editor.session.paused")
          )}
          {" · "}
          <button onClick={onChange} className="underline decoration-dotted hover:text-gray-900">{t("editor.session.change")}</button>
        </span>
      </span>
    );
  }

  return (
    <footer className="hidden md:flex items-center gap-[18px] h-[30px] px-4 bg-white border-t border-gray-200 text-[12px] text-gray-500 flex-shrink-0 whitespace-nowrap" aria-label={t("glossary.sessionBar")}>
      <div className="min-w-0 flex-1 flex">{left}</div>
      <span className="flex-shrink-0">
        {status}
        {advisorName ? ` · ${t("editor.session.advisor", { name: advisorName })}` : ""}
      </span>
      <button onClick={onWordCount} className="hover:text-gray-900 flex-shrink-0" title={t("editor.details.title")}>
        {t("editor.session.wordsOf", { words: fmt.number(words), target: fmt.number(targetWords) })}
      </button>
      <span className="flex-shrink-0">{pages === 1 ? t("editor.session.pages_one") : t("editor.session.pages", { n: pages })}</span>
      {dl ? (
        <button onClick={onDeadline || onWordCount} className={`flex items-center gap-1 flex-shrink-0 font-medium hover:underline ${DEADLINE_TEXT[dl.tone]}`} title={t("deadline.due", { date: fmt.date(deadline as string) })} aria-label={`${t("deadline.title")}: ${deadlineLabel(dl)}`} data-testid="session-deadline">
          <CalendarClock className="w-3.5 h-3.5" />{deadlineLabel(dl)}
        </button>
      ) : onDeadline ? (
        <button onClick={onDeadline} className="flex items-center gap-1 flex-shrink-0 hover:text-gray-900" data-testid="session-deadline">
          <CalendarClock className="w-3.5 h-3.5" />{t("deadline.add")}
        </button>
      ) : null}
      <span className="flex-shrink-0">{citationStyle}</span>
      {zoom !== 100 && <span className="flex-shrink-0">{zoom}%</span>}
    </footer>
  );
}
