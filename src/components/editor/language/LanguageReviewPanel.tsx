"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BookA, Check, SpellCheck, VolumeX, X } from "lucide-react";
import { api } from "@/lib/client";
import { Toggle } from "@/components/ui";
import { PanelShell } from "../Sidebars";
import {
  CheckResponse,
  LANGUAGE_CATEGORIES,
  LANGUAGE_REVIEW_LABEL,
  LanguageCategory,
  LanguageReviewStorage,
  LanguageSuggestion,
  languageReviewKey,
  originalTextOf,
  paragraphTextOf,
  revealLanguageSuggestion,
  runLanguageCheck,
  watchLanguageReview,
} from "./languageReview";

interface Prefs {
  thesisId: string;
  language: "en-US" | "en-GB" | "es" | "fr" | "auto";
  motherTongue?: string;
  mutedCategories: string[];
  mutedRules: string[];
  dictionary: string[];
}

const CATEGORY_LABEL: Record<LanguageCategory, string> = { spelling: "Spelling", grammar: "Grammar", punctuation: "Punctuation", style: "Style", consistency: "Consistency" };
const CHIP_CLASS: Record<LanguageCategory, string> = {
  spelling: "border-red-600 text-red-600",
  grammar: "border-brand-600 text-brand-700",
  punctuation: "border-amber-600 text-amber-600",
  style: "border-prov-ai text-prov-ai-deep",
  consistency: "border-gray-500 text-gray-600",
};
const LANGUAGES: { id: Prefs["language"]; label: string }[] = [
  { id: "auto", label: "Detect automatically" },
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
];

const LS_LIVE = "language_review_live";
const LS_STYLE = "language_review_style";

const readLs = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
};
const writeLs = (key: string, v: boolean) => {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* private mode */
  }
};

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function LanguageReviewPanel({ editor, thesisId, sessionId, canEdit, onClose }: { editor: Editor; thesisId: string; sessionId?: string; canEdit: boolean; onClose: () => void }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [live, setLive] = useState(() => readLs(LS_LIVE, canEdit));
  const [includeStyle, setIncludeStyle] = useState(() => readLs(LS_STYLE, false));
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ accepted: 0, dismissed: 0 });
  const shownIds = useRef(new Set<string>());
  const includeStyleRef = useRef(includeStyle);
  includeStyleRef.current = includeStyle;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const storage = editor.storage.languageReview as LanguageReviewStorage | undefined;
  const installed = !!storage;

  // ---------- plugin state ----------
  const pluginState = languageReviewKey.getState(editor.state);
  const suggestions = useMemo(() => {
    const list: LanguageSuggestion[] = [];
    pluginState?.suggestions.forEach((s) => list.push(s));
    list.sort((a, b) => a.from - b.from);
    list.forEach((s) => shownIds.current.add(s.id));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, pluginState]);

  useEffect(() => {
    const onTx = () => {
      const st = languageReviewKey.getState(editor.state);
      setVersion(st?.version ?? 0);
      setActiveId(st?.activeId ?? null);
    };
    onTx();
    editor.on("transaction", onTx);
    return () => {
      editor.off("transaction", onTx);
    };
  }, [editor]);

  // ---------- prefs ----------
  useEffect(() => {
    let cancelled = false;
    api<{ prefs: Prefs }>(`/api/language/prefs?thesisId=${encodeURIComponent(thesisId)}`)
      .then((r) => {
        if (!cancelled) setPrefs(r.prefs);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setStatus("error");
          setMessage(e.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [thesisId]);

  useEffect(() => {
    if (!storage || !prefs) return;
    storage.muted.categories = new Set(prefs.mutedCategories);
    storage.muted.rules = new Set(prefs.mutedRules.map((r) => r.toUpperCase()));
  }, [storage, prefs]);

  const savePrefs = useCallback(
    async (patch: Partial<Prefs>, opts: { recheck?: boolean } = {}) => {
      const prev = prefsRef.current;
      if (!prev) return;
      setPrefs({ ...prev, ...patch });
      try {
        const r = await api<{ prefs: Prefs }>(`/api/language/prefs?thesisId=${encodeURIComponent(thesisId)}`, { method: "PUT", json: patch });
        setPrefs(r.prefs);
        if (opts.recheck) {
          editor.commands.clearLanguageSuggestions();
          setTimeout(() => void check(), 0);
        }
      } catch (e) {
        setPrefs(prev);
        setStatus("error");
        setMessage((e as Error).message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thesisId, editor]
  );

  // ---------- checking ----------
  const checking = useRef(false);
  const rerun = useRef<boolean | null>(null);
  const check = useCallback(
    async (force = false) => {
      if (!installed || editor.isDestroyed) return;
      if (checking.current) {
        // A check is in flight; run once more when it finishes so the latest text is covered.
        rerun.current = rerun.current || force;
        return;
      }
      checking.current = true;
      setStatus("checking");
      try {
        const r = await runLanguageCheck(
          editor,
          (paragraphs) => api<CheckResponse>("/api/language/check", { method: "POST", json: { thesisId, paragraphs, includeStyle: includeStyleRef.current, sessionId } }),
          { force }
        );
        const res = r.response;
        if (res?.error) {
          setStatus("error");
          setMessage(res.error);
        } else {
          setStatus("idle");
          if (res?.style?.skipped === "consent_required") setMessage("Academic style needs the monitoring consent for AI interactions. LanguageTool checks still run.");
          else if (res?.style?.skipped === "mode_not_allowed") setMessage("Your institution's AI policy does not enable the Grammar mode, so the academic style layer is off.");
          else if (res?.style?.error) setMessage(`Academic style: ${res.style.error}`);
          else setMessage(null);
        }
      } catch (e) {
        setStatus("error");
        setMessage((e as Error).message);
      } finally {
        checking.current = false;
        if (rerun.current !== null) {
          const force = rerun.current;
          rerun.current = null;
          setTimeout(() => void check(force), 0);
        }
      }
    },
    [editor, installed, thesisId, sessionId]
  );

  useEffect(() => {
    if (!installed) return;
    editor.commands.setLanguageReviewEnabled(live);
    if (!live || !prefs) return;
    void check();
    return watchLanguageReview(editor, () => void check());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, installed, live, !!prefs]);

  useEffect(() => writeLs(LS_LIVE, live), [live]);
  useEffect(() => writeLs(LS_STYLE, includeStyle), [includeStyle]);

  const toggleStyle = (v: boolean) => {
    setIncludeStyle(v);
    includeStyleRef.current = v;
    if (v && live) setTimeout(() => void check(true), 0);
    if (!v) editor.commands.removeLanguageSuggestionsWhere({ ruleId: "LLM_ACADEMIC_STYLE" });
  };

  // ---------- actions ----------
  const accept = (s: LanguageSuggestion) => {
    if (!canEdit) return;
    const words = wordCount(s.replacement);
    if (editor.commands.acceptLanguageSuggestion(s.id)) {
      setCounts((c) => ({ ...c, accepted: c.accepted + 1 }));
      setNotice(s.provenance === "ai" ? `Marked as AI-assisted: ${LANGUAGE_REVIEW_LABEL}, ${words} word${words === 1 ? "" : "s"}.` : null);
    }
  };
  const acceptMany = (list: LanguageSuggestion[]) => {
    if (!canEdit || !list.length) return;
    const aiWords = list.filter((s) => s.provenance === "ai").reduce((n, s) => n + wordCount(s.replacement), 0);
    if (editor.commands.acceptLanguageSuggestions(list.map((s) => s.id))) {
      setCounts((c) => ({ ...c, accepted: c.accepted + list.length }));
      setNotice(aiWords ? `Marked as AI-assisted: ${LANGUAGE_REVIEW_LABEL}, ${aiWords} word${aiWords === 1 ? "" : "s"}.` : null);
    }
  };
  const dismiss = (s: LanguageSuggestion) => {
    if (editor.commands.dismissLanguageSuggestion(s.id)) setCounts((c) => ({ ...c, dismissed: c.dismissed + 1 }));
  };
  const muteRule = (s: LanguageSuggestion) => {
    if (!prefs) return;
    const rules = Array.from(new Set([...prefs.mutedRules, s.ruleId]));
    storage?.muted.rules.add(s.ruleId.toUpperCase());
    const n = suggestions.filter((x) => x.ruleId === s.ruleId).length;
    editor.commands.removeLanguageSuggestionsWhere({ ruleId: s.ruleId });
    setCounts((c) => ({ ...c, dismissed: c.dismissed + n }));
    void savePrefs({ mutedRules: rules });
  };
  const toggleCategory = (cat: LanguageCategory) => {
    if (!prefs) return;
    const muted = prefs.mutedCategories.includes(cat);
    if (muted) {
      void savePrefs({ mutedCategories: prefs.mutedCategories.filter((c) => c !== cat) }, { recheck: true });
    } else {
      storage?.muted.categories.add(cat);
      const n = suggestions.filter((x) => x.category === cat).length;
      editor.commands.removeLanguageSuggestionsWhere({ category: cat });
      setCounts((c) => ({ ...c, dismissed: c.dismissed + n }));
      void savePrefs({ mutedCategories: [...prefs.mutedCategories, cat] });
    }
  };
  const addToDictionary = (s: LanguageSuggestion) => {
    if (!prefs) return;
    const word = originalTextOf(editor, s).trim();
    if (!word) return;
    const same = suggestions.filter((x) => x.category === "spelling" && originalTextOf(editor, x).trim().toLowerCase() === word.toLowerCase());
    editor.commands.dismissLanguageSuggestions(same.map((x) => x.id));
    setCounts((c) => ({ ...c, dismissed: c.dismissed + same.length }));
    void savePrefs({ dictionary: Array.from(new Set([...prefs.dictionary, word])) });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    const active = activeId ? suggestions.find((s) => s.id === activeId) : undefined;
    if (!active) return;
    if (e.key === "Enter") {
      e.preventDefault();
      accept(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dismiss(active);
    }
  };

  // ---------- derived ----------
  const byCategory = useMemo(() => {
    const m: Record<LanguageCategory, number> = { spelling: 0, grammar: 0, punctuation: 0, style: 0, consistency: 0 };
    suggestions.forEach((s) => (m[s.category] += 1));
    return m;
  }, [suggestions]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, LanguageSuggestion[]>();
    suggestions.forEach((s) => {
      if (!map.has(s.paragraphKey)) {
        map.set(s.paragraphKey, []);
        order.push(s.paragraphKey);
      }
      map.get(s.paragraphKey)!.push(s);
    });
    return order.map((key) => ({ key, items: map.get(key)!, preview: paragraphTextOf(editor, map.get(key)![0]) }));
  }, [suggestions, editor]);

  if (!installed) {
    return (
      <PanelShell title="Language review" icon={<SpellCheck className="w-4 h-4 text-gray-500" />} onClose={onClose}>
        <div className="p-4 text-xs text-gray-500">The language review extension is not loaded in this editor.</div>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Language review"
      icon={<SpellCheck className="w-4 h-4 text-gray-500" />}
      onClose={onClose}
      actions={
        <label className="flex items-center gap-2 text-[11px] text-gray-500">
          <span>{live ? "Live" : "Paused"}</span>
          <Toggle checked={live} onChange={setLive} label="Check the document while writing" />
        </label>
      }
    >
      <div className="flex flex-col h-full min-h-0" onKeyDown={onKeyDown} tabIndex={-1}>
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 space-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="lr-language" className="text-[12px] text-gray-500 flex-shrink-0">
              Language
            </label>
            <select
              id="lr-language"
              value={prefs?.language || "auto"}
              disabled={!prefs || !canEdit}
              onChange={(e) => void savePrefs({ language: e.target.value as Prefs["language"] }, { recheck: true })}
              className="flex-1 h-8 text-[13px] border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:border-brand-400 disabled:opacity-60"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-gray-600">Academic style (uses the AI model)</span>
            <Toggle checked={includeStyle} onChange={toggleStyle} disabled={!canEdit} label="Academic style suggestions from the AI model" />
          </div>
          {includeStyle && <p className="text-[11px] text-gray-500">Style rewrites that change more than three words are marked AI-assisted when you accept them. Spelling, grammar and punctuation fixes stay yours.</p>}
          <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Filter by category">
            {LANGUAGE_CATEGORIES.map((cat) => {
              const muted = prefs?.mutedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  disabled={!prefs || !canEdit}
                  aria-pressed={!muted}
                  aria-label={`${CATEGORY_LABEL[cat]}: ${muted ? "muted for this thesis" : `${byCategory[cat]} shown`}`}
                  title={muted ? "Muted for this thesis. Click to show again." : "Click to mute this category for the whole thesis."}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-[10px] border text-[11px] font-medium ${muted ? "border-gray-200 text-gray-400 line-through bg-gray-50" : `${CHIP_CLASS[cat]} bg-white`} disabled:cursor-default`}
                >
                  {CATEGORY_LABEL[cat]}
                  {!muted && <span className="tabular-nums">{byCategory[cat]}</span>}
                  {muted && <VolumeX className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
          {message && <p className={`text-[11px] ${status === "error" ? "text-amber-600" : "text-gray-500"}`}>{message}</p>}
          {notice && (
            <p className="text-[11px] text-prov-ai-deep flex items-start gap-1.5">
              <Check className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="text-gray-400 hover:text-gray-600" aria-label="Hide notice">
                <X className="w-3 h-3" />
              </button>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!live && <div className="p-4 text-xs text-gray-500">Live checking is paused. Turn it on to see suggestions while you write.</div>}
          {live && suggestions.length === 0 && (
            <div className="p-4 text-xs text-gray-500">{status === "checking" ? "Checking the document…" : "No suggestions for the current text."}</div>
          )}
          {groups.map((g) => (
            <section key={g.key} className="border-b border-gray-100">
              <header className="flex items-center gap-2 px-3 py-1.5 bg-gray-50">
                <div className="flex-1 text-[11px] text-gray-500 truncate" title={g.preview}>
                  {g.preview.slice(0, 70) || "Paragraph"}
                </div>
                {canEdit && g.items.length > 1 && (
                  <button type="button" onClick={() => acceptMany(g.items)} className="text-[11px] text-brand-700 hover:underline flex-shrink-0" aria-label={`Accept all ${g.items.length} suggestions in this paragraph`}>
                    Accept all in paragraph ({g.items.length})
                  </button>
                )}
              </header>
              <ul>
                {g.items.map((s) => {
                  const original = originalTextOf(editor, s);
                  const inSentence = g.items.filter((x) => x.sentence === s.sentence);
                  const isActive = s.id === activeId;
                  const words = wordCount(s.replacement);
                  return (
                    <li key={s.id} className={`px-3 py-2.5 border-t border-gray-100 ${isActive ? "bg-brand-50/60" : "hover:bg-gray-50"}`}>
                      <button type="button" onClick={() => revealLanguageSuggestion(editor, s.id)} className="w-full text-left" aria-label={`Show in document: ${CATEGORY_LABEL[s.category]} suggestion`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center h-5 px-1.5 rounded-[10px] border text-[11px] font-medium ${CHIP_CLASS[s.category]}`}>{CATEGORY_LABEL[s.category]}</span>
                          {s.source === "llm" && <span className="text-[11px] text-gray-400">AI model</span>}
                          <span className="ml-auto text-[11px] text-gray-400 font-mono truncate max-w-[140px]" title={s.ruleId}>
                            {s.ruleId}
                          </span>
                        </div>
                        <div className="text-[13px] leading-snug text-gray-800">
                          <span className="line-through text-gray-400 break-words">{original || "…"}</span>
                          <span className="mx-1.5 text-gray-400">→</span>
                          <span className={`font-medium break-words ${s.replacement ? "" : "italic text-gray-500"}`}>{s.replacement || "remove"}</span>
                        </div>
                        <div className="text-[12px] text-gray-600 mt-1">{s.message}</div>
                      </button>
                      {s.provenance === "ai" && canEdit && (
                        <div className="text-[11px] text-prov-ai-deep mt-1.5">
                          Accepting marks {words} word{words === 1 ? "" : "s"} as AI-assisted ({LANGUAGE_REVIEW_LABEL}).
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {canEdit && (
                          <button type="button" onClick={() => accept(s)} className="h-7 px-2.5 rounded-md bg-brand-600 text-white text-[12px] font-medium hover:bg-brand-700" aria-label="Accept this suggestion">
                            Accept
                          </button>
                        )}
                        <button type="button" onClick={() => dismiss(s)} className="h-7 px-2.5 rounded-md border border-gray-200 text-[12px] text-gray-700 hover:bg-gray-100" aria-label="Dismiss this suggestion">
                          Dismiss
                        </button>
                        {canEdit && inSentence.length > 1 && (
                          <button type="button" onClick={() => acceptMany(inSentence)} className="h-7 px-2 rounded-md text-[12px] text-brand-700 hover:bg-brand-50" aria-label={`Accept all ${inSentence.length} suggestions in this sentence`}>
                            Accept all in sentence ({inSentence.length})
                          </button>
                        )}
                        {canEdit && s.source === "lt" && (
                          <button type="button" onClick={() => muteRule(s)} className="h-7 px-2 rounded-md text-[12px] text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1" aria-label={`Mute rule ${s.ruleId} for this thesis`}>
                            <VolumeX className="w-3.5 h-3.5" />
                            Mute this rule
                          </button>
                        )}
                        {canEdit && s.category === "spelling" && original.trim() && (
                          <button type="button" onClick={() => addToDictionary(s)} className="h-7 px-2 rounded-md text-[12px] text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1" aria-label={`Add “${original.trim()}” to the thesis dictionary`}>
                            <BookA className="w-3.5 h-3.5" />
                            Add to dictionary
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <footer className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500 flex items-center gap-2 flex-shrink-0">
          <span className="flex-1">
            Shown {shownIds.current.size} · accepted {counts.accepted} · dismissed {counts.dismissed} this session
          </span>
          {status === "checking" && <span aria-live="polite">Checking…</span>}
          {canEdit && activeId && <span className="hidden sm:inline">Enter accepts · Esc dismisses</span>}
        </footer>
      </div>
    </PanelShell>
  );
}

export default LanguageReviewPanel;
