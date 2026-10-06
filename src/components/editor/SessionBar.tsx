"use client";

import { ShieldCheck, StickyNote } from "lucide-react";
import type { ConsentScopes } from "../useUser";

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
  page: number;
  pages: number;
  citationStyle: string;
  zoom: number;
  onWordCount: () => void;
  /** Shown instead of the recording phrase while a working tab (not the Final submission) is open. */
  workingTab?: { title: string; onGoToSubmission: () => void } | null;
}

const SCOPE_WORDS: { key: keyof ConsentScopes; label: string }[] = [
  { key: "paste", label: "pastes" },
  { key: "aiInteractions", label: "AI use" },
  { key: "tabActivity", label: "tab activity" },
  { key: "keystrokes", label: "typing rhythm" },
];

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Session bar (30px, bottom of the editor): what the current session records, in the student's own consent
 * terms, and the document facts an advisor glances at (status, words, page, citation style).
 */
export default function SessionBar({ sessionActive, scopes, onChange, isOwner, reviewMode, status, advisorName, words, targetWords, page, pages, citationStyle, zoom, onWordCount, workingTab }: Props) {
  const granted = scopes ? SCOPE_WORDS.filter((s) => scopes[s.key]).map((s) => s.label) : [];
  const recording = sessionActive && scopes;

  let left: React.ReactNode;
  if (workingTab) {
    left = (
      <span className="flex items-center gap-2 min-w-0">
        <StickyNote className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        <span className="truncate">
          Working tab <b className="font-semibold text-gray-900">{workingTab.title}</b> · not submitted; only Final submission counts
        </span>
        <button onClick={workingTab.onGoToSubmission} className="underline decoration-dotted hover:text-gray-900 flex-shrink-0">Go to Final submission</button>
      </span>
    );
  } else if (reviewMode && !isOwner) {
    left = (
      <span className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
        <span className="truncate">Review mode · AI-assisted text in purple, quoted or pasted text in amber · select text to comment</span>
      </span>
    );
  } else if (!isOwner) {
    left = <span className="truncate">Read-only view</span>;
  } else {
    left = (
      <span className="flex items-center gap-[7px] min-w-0">
        <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${recording ? "bg-green-500 session-dot" : "bg-gray-300"}`} />
        <span className="truncate">
          {recording ? (
            granted.length ? (
              <>
                Session recording <b className="font-semibold text-gray-900">{joinList(granted)}</b>
                {!scopes.keystrokes && ", not keystrokes"}
              </>
            ) : (
              <>Session active, <b className="font-semibold text-gray-900">recording nothing</b></>
            )
          ) : (
            "Monitoring paused"
          )}
          {" · "}
          <button onClick={onChange} className="underline decoration-dotted hover:text-gray-900">change</button>
        </span>
      </span>
    );
  }

  return (
    <footer className="hidden md:flex items-center gap-[18px] h-[30px] px-4 bg-white border-t border-gray-200 text-[12px] text-gray-500 flex-shrink-0 whitespace-nowrap" aria-label="Session bar">
      <div className="min-w-0 flex-1 flex">{left}</div>
      <span className="flex-shrink-0">
        {status}
        {advisorName ? ` · Advisor: ${advisorName}` : ""}
      </span>
      <button onClick={onWordCount} className="hover:text-gray-900 flex-shrink-0" title="Document details">
        {words.toLocaleString()} of {targetWords.toLocaleString()} words
      </button>
      <span className="flex-shrink-0">Page ~{page} of {pages}</span>
      <span className="flex-shrink-0">{citationStyle}</span>
      {zoom !== 100 && <span className="flex-shrink-0">{zoom}%</span>}
    </footer>
  );
}
