/**
 * Language review: inline suggestions (spelling, grammar, punctuation, style, consistency) stored as document
 * positions in plugin state and mapped through every transaction. A suggestion whose range is touched by an
 * edit is dropped (Grammarly's rebase rule: hide instead of flicker). Rendering is a Decoration.inline per
 * suggestion with class `lr lr-<category>` (+ `lr-active`).
 *
 * The extension owns no network code. `runLanguageCheck(editor, fetch)` serialises the paragraphs that are
 * not in the content-hash cache, hands them to `fetch` (the panel calls /api/language/check) and applies
 * the answer. `watchLanguageReview` debounces that on document updates (>= 700 ms).
 */
import { Editor, Extension } from "@tiptap/core";
import type { Node as PMNode, Mark } from "@tiptap/pm/model";
import { Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type LanguageCategory = "spelling" | "grammar" | "punctuation" | "style" | "consistency";
export const LANGUAGE_CATEGORIES: LanguageCategory[] = ["spelling", "grammar", "punctuation", "style", "consistency"];
export const LANGUAGE_REVIEW_LABEL = "Language review";
export const LANGUAGE_REVIEW_DEBOUNCE_MS = 700;

export interface LanguageSuggestion {
  id: string;
  /** Document positions; kept current through tr.mapping. */
  from: number;
  to: number;
  replacement: string;
  category: LanguageCategory;
  message: string;
  shortMessage?: string;
  ruleId: string;
  source: "lt" | "llm";
  provenance: "human" | "ai";
  paragraphKey: string;
  /** 0-based sentence index inside the paragraph, for "accept all in this sentence". */
  sentence: number;
  alternatives?: string[];
}

/** A suggestion as the API returns it: offsets relative to the paragraph's original (text + markup) string. */
export interface RelativeSuggestion {
  id: string;
  from: number;
  to: number;
  replacement: string;
  category: LanguageCategory;
  message: string;
  shortMessage?: string;
  ruleId: string;
  source: "lt" | "llm";
  provenance: "human" | "ai";
  alternatives?: string[];
}

export type AnnotationItem = { text: string } | { markup: string; interpretAs?: string };

export interface AnnotatedParagraph {
  /** Content hash of the parts; same text → same key. */
  key: string;
  /** Document position of the first character of the block's content. */
  from: number;
  /** Document position after the last character. */
  to: number;
  parts: AnnotationItem[];
  /** The original string the API offsets refer to (text + markup); offset i is at doc position from + i. */
  text: string;
  /** Ranges (relative offsets) the checker must never touch. */
  protectedRanges: { from: number; to: number }[];
}

export interface LanguageReviewState {
  suggestions: Map<string, LanguageSuggestion>;
  enabled: boolean;
  activeId: string | null;
  decorations: DecorationSet;
  /** Bumped on every change to `suggestions`, so React can memo on it. */
  version: number;
}

export interface LanguageReviewStorage {
  /** Paragraph key → relative suggestions returned for that exact text. */
  cache: Map<string, RelativeSuggestion[]>;
  cacheOrder: string[];
  /** Ids the student dismissed; never shown again in this editor session. */
  dismissed: Set<string>;
  /** Paragraph keys currently in flight. */
  pending: Set<string>;
  /** Mirror of the thesis prefs, applied when cached answers are re-shown (the server filters fresh answers). */
  muted: { categories: Set<string>; rules: Set<string> };
}

export const languageReviewKey = new PluginKey<LanguageReviewState>("languageReview");

type Action =
  | { type: "set"; paragraphKey: string; range: { from: number; to: number }; list: LanguageSuggestion[] }
  | { type: "remove"; ids: string[] }
  | { type: "removeWhere"; category?: LanguageCategory; ruleId?: string }
  | { type: "active"; id: string | null }
  | { type: "clear" }
  | { type: "enabled"; enabled: boolean };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    languageReview: {
      /** Replaces the suggestions of a paragraph (by key, and anything inside its range). */
      setLanguageSuggestions: (paragraphKey: string, list: LanguageSuggestion[], range?: { from: number; to: number }) => ReturnType;
      /** Applies the replacement; AI-provenance rewrites get the provenance mark { source: "ai", label: "Language review" }. */
      acceptLanguageSuggestion: (id: string) => ReturnType;
      /** Applies several suggestions in one transaction (accept all in sentence / paragraph). */
      acceptLanguageSuggestions: (ids: string[]) => ReturnType;
      dismissLanguageSuggestion: (id: string) => ReturnType;
      dismissLanguageSuggestions: (ids: string[]) => ReturnType;
      /** Drops shown suggestions of a category or rule (after muting it). */
      removeLanguageSuggestionsWhere: (filter: { category?: LanguageCategory; ruleId?: string }) => ReturnType;
      setActiveLanguageSuggestion: (id: string | null) => ReturnType;
      clearLanguageSuggestions: () => ReturnType;
      setLanguageReviewEnabled: (enabled: boolean) => ReturnType;
    };
  }
}

// ---------- Helpers ----------

/** FNV-1a 32-bit over the parts, hex. Collisions are harmless (a stale underline at worst). */
export function hashParts(parts: AnnotationItem[]): string {
  const s = parts.map((p) => ("text" in p ? `t${p.text}` : `m${p.markup}`)).join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${s.length.toString(36)}`;
}

const PROTECTED_MARKS = ["citation", "citationMark", "citedPassage", "code", "link"];
// $...$, \( ... \) and chains like "x = 3" or "p ≤ 0.05"; "p-value" is not matched because +/- are not operators here.
const MATH_RE = /\$[^$\n]{1,200}\$|\\\([^\n]{1,200}?\\\)|[A-Za-z0-9_^{}()\\.]+(?:\s?[=≤≥≈±×÷]\s?[A-Za-z0-9_^{}()\\.%]+)+/g;

function pushText(parts: AnnotationItem[], text: string) {
  const last = parts[parts.length - 1];
  if (last && "text" in last) last.text += text;
  else parts.push({ text });
}

function pushMarkup(parts: AnnotationItem[], markup: string, interpretAs = "") {
  parts.push({ markup, interpretAs });
}

function splitSentences(text: string): number[] {
  // Start offsets of sentences.
  const starts = [0];
  const re = /[.!?]["”’)]*\s+(?=\S)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index + m[0].length);
  return starts;
}

export function sentenceIndexAt(text: string, offset: number): number {
  const starts = splitSentences(text);
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= offset) idx = i;
  return idx;
}

/**
 * Serialises every textblock of the document as LanguageTool annotation items. Text runs carrying citation,
 * cited-passage, code or link marks, inline atoms, hard breaks and math-like spans become `markup` of the
 * same length as the document span they stand for, so API offsets map to doc positions as `from + offset`.
 */
export function paragraphsToAnnotated(editor: Editor): AnnotatedParagraph[] {
  const out: AnnotatedParagraph[] = [];
  const doc = editor.state.doc;
  doc.descendants((node: PMNode, pos: number) => {
    if (!node.isTextblock) return true;
    if (node.type.name === "codeBlock" || node.type.spec.code) return false;
    if (!node.textContent.trim()) return false;
    const parts: AnnotationItem[] = [];
    const contentStart = pos + 1;
    node.forEach((child: PMNode) => {
      if (child.isText && child.text) {
        const protectedRun = child.marks.some((m: Mark) => PROTECTED_MARKS.includes(m.type.name));
        if (protectedRun) {
          pushMarkup(parts, child.text, "");
          return;
        }
        let last = 0;
        MATH_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        const text = child.text;
        while ((m = MATH_RE.exec(text))) {
          if (m.index > last) pushText(parts, text.slice(last, m.index));
          pushMarkup(parts, m[0], "");
          last = m.index + m[0].length;
          if (!m[0].length) MATH_RE.lastIndex++;
        }
        if (last < text.length) pushText(parts, text.slice(last));
      } else if (child.type.name === "hardBreak") {
        pushMarkup(parts, "\n", "\n");
      } else {
        // Inline atom (image, mention, footnote anchor…): nodeSize is 1 in the document.
        pushMarkup(parts, "￼".repeat(Math.max(1, child.nodeSize)), "");
      }
    });
    const text = parts.map((p) => ("text" in p ? p.text : p.markup)).join("");
    const protectedRanges: { from: number; to: number }[] = [];
    let o = 0;
    for (const p of parts) {
      const len = "text" in p ? p.text.length : p.markup.length;
      if (!("text" in p)) protectedRanges.push({ from: o, to: o + len });
      o += len;
    }
    out.push({ key: hashParts(parts), from: contentStart, to: contentStart + node.content.size, parts, text, protectedRanges });
    return false;
  });
  return out;
}

function toAbsolute(p: AnnotatedParagraph, rel: RelativeSuggestion[], storage: LanguageReviewStorage): LanguageSuggestion[] {
  const list: LanguageSuggestion[] = [];
  for (const s of rel) {
    if (storage.dismissed.has(s.id)) continue;
    if (storage.muted.categories.has(s.category) || storage.muted.rules.has(s.ruleId.toUpperCase())) continue;
    if (s.from < 0 || s.to > p.text.length || s.to <= s.from) continue;
    if (p.protectedRanges.some((r) => s.from < r.to && s.to > r.from)) continue;
    list.push({ ...s, from: p.from + s.from, to: p.from + s.to, paragraphKey: p.key, sentence: sentenceIndexAt(p.text, s.from) });
  }
  return list;
}

function buildDecorations(doc: PMNode, state: Pick<LanguageReviewState, "suggestions" | "activeId" | "enabled">): DecorationSet {
  if (!state.enabled) return DecorationSet.empty;
  const decos: Decoration[] = [];
  state.suggestions.forEach((s) => {
    if (s.to <= s.from || s.to > doc.content.size) return;
    decos.push(Decoration.inline(s.from, s.to, { class: `lr lr-${s.category}${s.id === state.activeId ? " lr-active" : ""}`, "data-lr-id": s.id }));
  });
  return DecorationSet.create(doc, decos);
}

/** Maps a range through the transaction; `touched` is true when any step changed text inside or at its edges. */
function mapRange(tr: Transaction, from: number, to: number): { from: number; to: number; touched: boolean } {
  let f = from;
  let t = to;
  let touched = false;
  for (const map of tr.mapping.maps) {
    map.forEach((oldStart: number, oldEnd: number) => {
      if (oldStart <= t && oldEnd >= f) touched = true;
    });
    f = map.map(f, 1);
    t = map.map(t, -1);
  }
  return { from: f, to: t, touched };
}

function applyAction(suggestions: Map<string, LanguageSuggestion>, action: Action): Map<string, LanguageSuggestion> {
  const next = new Map(suggestions);
  switch (action.type) {
    case "set": {
      const drop: string[] = [];
      next.forEach((s, id) => {
        if (s.paragraphKey === action.paragraphKey || (s.from >= action.range.from && s.to <= action.range.to)) drop.push(id);
      });
      drop.forEach((id) => next.delete(id));
      for (const s of action.list) next.set(s.id, s);
      return next;
    }
    case "remove":
      action.ids.forEach((id) => next.delete(id));
      return next;
    case "removeWhere": {
      const drop: string[] = [];
      next.forEach((s, id) => {
        if ((action.category && s.category === action.category) || (action.ruleId && s.ruleId === action.ruleId)) drop.push(id);
      });
      drop.forEach((id) => next.delete(id));
      return next;
    }
    case "clear":
      return new Map();
    default:
      return suggestions;
  }
}

function replaceRange(tr: Transaction, s: LanguageSuggestion) {
  const { schema } = tr.doc.type;
  if (!s.replacement) {
    tr.delete(s.from, s.to);
    return;
  }
  const node = tr.doc.nodeAt(s.from);
  let marks: readonly Mark[] = node && node.isText ? node.marks : tr.doc.resolve(s.from).marks();
  const prov = schema.marks.provenance;
  if (s.provenance === "ai" && prov) {
    marks = prov.create({ source: "ai", label: LANGUAGE_REVIEW_LABEL }).addToSet(marks.filter((m) => m.type !== prov));
  }
  tr.replaceWith(s.from, s.to, schema.text(s.replacement, marks));
}

// ---------- Extension ----------

export const LanguageReview = Extension.create<Record<string, never>, LanguageReviewStorage>({
  name: "languageReview",

  addStorage() {
    return { cache: new Map<string, RelativeSuggestion[]>(), cacheOrder: [], dismissed: new Set<string>(), pending: new Set<string>(), muted: { categories: new Set<string>(), rules: new Set<string>() } };
  },

  addCommands() {
    const dispatchAction = (tr: Transaction, action: Action) => tr.setMeta(languageReviewKey, action);
    return {
      setLanguageSuggestions:
        (paragraphKey, list, range) =>
        ({ tr, dispatch }) => {
          const r = range || list.reduce((acc, s) => ({ from: Math.min(acc.from, s.from), to: Math.max(acc.to, s.to) }), { from: Infinity, to: -Infinity });
          dispatchAction(tr, { type: "set", paragraphKey, range: Number.isFinite(r.from) ? r : { from: 0, to: 0 }, list });
          if (dispatch) dispatch(tr);
          return true;
        },
      acceptLanguageSuggestion:
        (id) =>
        ({ tr, state, dispatch, editor }) => {
          if (!editor.isEditable) return false;
          const s = languageReviewKey.getState(state)?.suggestions.get(id);
          if (!s) return false;
          replaceRange(tr, s);
          dispatchAction(tr, { type: "remove", ids: [id] });
          if (dispatch) dispatch(tr);
          return true;
        },
      acceptLanguageSuggestions:
        (ids) =>
        ({ tr, state, dispatch, editor }) => {
          if (!editor.isEditable) return false;
          const st = languageReviewKey.getState(state);
          if (!st) return false;
          const list = ids.map((id) => st.suggestions.get(id)).filter((x): x is LanguageSuggestion => !!x).sort((a, b) => b.from - a.from);
          if (!list.length) return false;
          // Right to left so earlier positions stay valid; overlapping ranges are skipped.
          let lastFrom = Infinity;
          for (const s of list) {
            if (s.to > lastFrom) continue;
            replaceRange(tr, s);
            lastFrom = s.from;
          }
          dispatchAction(tr, { type: "remove", ids: list.map((s) => s.id) });
          if (dispatch) dispatch(tr);
          return true;
        },
      dismissLanguageSuggestion:
        (id) =>
        ({ tr, dispatch, editor }) => {
          (editor.storage.languageReview as LanguageReviewStorage).dismissed.add(id);
          dispatchAction(tr, { type: "remove", ids: [id] });
          if (dispatch) dispatch(tr);
          return true;
        },
      dismissLanguageSuggestions:
        (ids) =>
        ({ tr, dispatch, editor }) => {
          const storage = editor.storage.languageReview as LanguageReviewStorage;
          ids.forEach((id) => storage.dismissed.add(id));
          dispatchAction(tr, { type: "remove", ids });
          if (dispatch) dispatch(tr);
          return true;
        },
      removeLanguageSuggestionsWhere:
        (filter) =>
        ({ tr, dispatch }) => {
          dispatchAction(tr, { type: "removeWhere", category: filter.category, ruleId: filter.ruleId });
          if (dispatch) dispatch(tr);
          return true;
        },
      setActiveLanguageSuggestion:
        (id) =>
        ({ tr, dispatch }) => {
          dispatchAction(tr, { type: "active", id });
          if (dispatch) dispatch(tr);
          return true;
        },
      clearLanguageSuggestions:
        () =>
        ({ tr, dispatch, editor }) => {
          const storage = editor.storage.languageReview as LanguageReviewStorage;
          storage.cache.clear();
          storage.cacheOrder = [];
          storage.pending.clear();
          dispatchAction(tr, { type: "clear" });
          if (dispatch) dispatch(tr);
          return true;
        },
      setLanguageReviewEnabled:
        (enabled) =>
        ({ tr, dispatch }) => {
          dispatchAction(tr, { type: "enabled", enabled });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<LanguageReviewState>({
        key: languageReviewKey,
        state: {
          init: () => ({ suggestions: new Map(), enabled: true, activeId: null, decorations: DecorationSet.empty, version: 0 }),
          apply: (tr, old, _oldState, newState) => {
            const action = tr.getMeta(languageReviewKey) as Action | undefined;
            if (!action && !tr.docChanged) return old;
            let suggestions = old.suggestions;
            let activeId = old.activeId;
            let enabled = old.enabled;
            let changed = false;

            if (tr.docChanged) {
              const mapped = new Map<string, LanguageSuggestion>();
              suggestions.forEach((s, id) => {
                const r = mapRange(tr, s.from, s.to);
                if (r.touched || r.to - r.from !== s.to - s.from || r.to <= r.from) return; // edited: drop (rebase rule)
                mapped.set(id, r.from === s.from && r.to === s.to ? s : { ...s, from: r.from, to: r.to });
              });
              suggestions = mapped;
              changed = true;
            }
            if (action) {
              if (action.type === "active") activeId = action.id;
              else if (action.type === "enabled") enabled = action.enabled;
              else {
                suggestions = applyAction(suggestions, action);
                changed = true;
              }
            }
            if (activeId && !suggestions.has(activeId)) activeId = null;
            const decorations = buildDecorations(newState.doc, { suggestions, activeId, enabled });
            return { suggestions, enabled, activeId, decorations, version: changed ? old.version + 1 : old.version };
          },
        },
        props: {
          decorations: (state) => languageReviewKey.getState(state)?.decorations || DecorationSet.empty,
          handleClick: (view, pos) => {
            const st = languageReviewKey.getState(view.state);
            if (!st || !st.enabled) return false;
            let hit: string | null = null;
            st.suggestions.forEach((s) => {
              if (pos >= s.from && pos <= s.to) hit = s.id;
            });
            if (hit !== st.activeId) view.dispatch(view.state.tr.setMeta(languageReviewKey, { type: "active", id: hit } as Action));
            return false;
          },
        },
      }),
    ];
  },
});

// ---------- Check orchestration (used by the panel) ----------

export interface CheckResponseParagraph {
  key: string;
  suggestions: RelativeSuggestion[];
}

export interface CheckResponse {
  paragraphs: CheckResponseParagraph[];
  language?: string;
  style?: { ran: boolean; skipped?: string; error?: string; interactionId?: string };
  error?: string;
}

export type CheckFetcher = (paragraphs: { key: string; parts: AnnotationItem[] }[]) => Promise<CheckResponse>;

const CACHE_MAX = 600;

function remember(storage: LanguageReviewStorage, key: string, list: RelativeSuggestion[]) {
  if (!storage.cache.has(key)) storage.cacheOrder.push(key);
  storage.cache.set(key, list);
  while (storage.cacheOrder.length > CACHE_MAX) {
    const k = storage.cacheOrder.shift();
    if (k) storage.cache.delete(k);
  }
}

/** Ids currently shown for a paragraph key. */
function shownFor(editor: Editor, key: string): number {
  const st = languageReviewKey.getState(editor.state);
  let n = 0;
  st?.suggestions.forEach((s) => {
    if (s.paragraphKey === key) n++;
  });
  return n;
}

/**
 * Checks the document: paragraphs whose hash is cached are re-applied from the cache when they currently show
 * nothing; the rest are sent through `fetch`. Returns what was checked and what is now shown.
 */
export async function runLanguageCheck(editor: Editor, fetch: CheckFetcher, opts: { force?: boolean } = {}): Promise<{ sent: number; shown: number; response?: CheckResponse }> {
  const storage = editor.storage.languageReview as LanguageReviewStorage | undefined;
  if (!storage) return { sent: 0, shown: 0 };
  const paragraphs = paragraphsToAnnotated(editor);
  const toSend: AnnotatedParagraph[] = [];
  let shown = 0;
  for (const p of paragraphs) {
    const cached = opts.force ? undefined : storage.cache.get(p.key);
    if (cached) {
      if (cached.length && shownFor(editor, p.key) === 0) {
        const list = toAbsolute(p, cached, storage);
        if (list.length) editor.commands.setLanguageSuggestions(p.key, list, { from: p.from, to: p.to });
        shown += list.length;
      }
      continue;
    }
    if (storage.pending.has(p.key)) continue;
    toSend.push(p);
  }
  if (!toSend.length) return { sent: 0, shown };

  toSend.forEach((p) => storage.pending.add(p.key));
  let response: CheckResponse;
  try {
    response = await fetch(toSend.map((p) => ({ key: p.key, parts: p.parts })));
  } catch (e) {
    toSend.forEach((p) => storage.pending.delete(p.key));
    throw e;
  }
  toSend.forEach((p) => storage.pending.delete(p.key));
  if (editor.isDestroyed) return { sent: toSend.length, shown, response };

  // The document may have moved on; locate each answered paragraph by its hash in the current document.
  const current = new Map<string, AnnotatedParagraph>();
  paragraphsToAnnotated(editor).forEach((p) => current.set(p.key, p));
  const failed = !!response.error && !response.paragraphs.length;
  for (const rp of response.paragraphs) {
    if (!failed) remember(storage, rp.key, rp.suggestions);
    const p = current.get(rp.key);
    if (!p) continue;
    const list = toAbsolute(p, rp.suggestions, storage);
    editor.commands.setLanguageSuggestions(rp.key, list, { from: p.from, to: p.to });
    shown += list.length;
  }
  return { sent: toSend.length, shown, response };
}

/**
 * Re-runs `run` at most once per quiet period of `delay` ms after document updates. Returns the unsubscribe
 * function. `run` receives nothing; the caller decides what to do (usually runLanguageCheck).
 */
export function watchLanguageReview(editor: Editor, run: () => void, delay = LANGUAGE_REVIEW_DEBOUNCE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onUpdate = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, Math.max(LANGUAGE_REVIEW_DEBOUNCE_MS, delay));
  };
  editor.on("update", onUpdate);
  return () => {
    editor.off("update", onUpdate);
    if (timer) clearTimeout(timer);
  };
}

/** Scrolls the editor to a suggestion and makes it the active one. */
export function revealLanguageSuggestion(editor: Editor, id: string) {
  const s = languageReviewKey.getState(editor.state)?.suggestions.get(id);
  if (!s) return;
  editor.commands.setActiveLanguageSuggestion(id);
  try {
    const dom = editor.view.domAtPos(s.from).node;
    const el = dom.nodeType === 1 ? (dom as HTMLElement) : (dom as Text).parentElement;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    /* position no longer in the view */
  }
}

/** Text of the paragraph that contains a suggestion (for group headers). */
export function paragraphTextOf(editor: Editor, s: LanguageSuggestion): string {
  try {
    return editor.state.doc.resolve(s.from).parent.textContent;
  } catch {
    return "";
  }
}

/** The document text a suggestion currently covers. */
export function originalTextOf(editor: Editor, s: LanguageSuggestion): string {
  try {
    return editor.state.doc.textBetween(s.from, s.to, "\n", "￼");
  } catch {
    return "";
  }
}
