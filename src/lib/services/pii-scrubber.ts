import { randomBytes } from "crypto";
import { engineHeaders } from "./private-engines";
import type { EngineLanguage, PIIEntity, PIISpan, ScrubbedText } from "../../types/engines";

export class PrivacyUnavailableError extends Error {
  constructor() { super("privacy_unavailable"); this.name = "PrivacyUnavailableError"; }
}
export type PIIAnalyzer = (text: string, language: EngineLanguage) => Promise<PIISpan[]>;
interface ScrubberOptions {
  knownNames?: string[]; knownEmails?: string[]; analyzer?: PIIAnalyzer;
  /** Strict by default: no silent downgrade to regex if NER is missing or fails. */
  requireNER?: boolean;
}
/** Request-scoped reversible pseudonymization, NOT proof of anonymization or full GDPR compliance.
 * Instantiate once per request, share across system/history/context, dispose after final restore.
 * Never store or log the map. Restore on the server before returning text to the owner.
 */
export class PIIScrubberService {
  private readonly prefix = `TF_${randomBytes(12).toString("hex")}_`;
  private readonly values = new Map<string, string>();
  private readonly tokens = new Map<string, string>();
  private disposed = false;
  constructor(private readonly options: ScrubberOptions = {}) {}
  async scrub(text: string, language: EngineLanguage = "en"): Promise<ScrubbedText> {
    if (this.disposed || typeof text !== "string" || text.length > 240000) throw new Error("invalid_input");
    if ((this.options.requireNER ?? true) && !this.options.analyzer) throw new PrivacyUnavailableError();
    const spans: PIISpan[] = [];
    const collect = (regex: RegExp, entity: PIIEntity) => {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text))) spans.push({ start: match.index, end: match.index + match[0].length, entity });
    };
    collect(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi, "EMAIL");
    collect(/\+\d[\d ().-]{6,}\d/g, "PHONE");
    const literal = (value: string, entity: PIIEntity) => {
      if (!value.trim()) return;
      const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      collect(new RegExp(escaped, "giu"), entity);
    };
    for (const name of this.options.knownNames ?? []) literal(name, "STUDENT_NAME");
    for (const email of this.options.knownEmails ?? []) literal(email, "EMAIL");
    if (this.options.analyzer) {
      try {
        const detected = await this.options.analyzer(text, language);
        if (!Array.isArray(detected) || detected.length > 10000 || detected.some(s =>
          !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > text.length ||
          !["STUDENT_NAME", "EMAIL", "PHONE", "PERSON", "LOCATION", "IDENTIFIER"].includes(s.entity))) throw new Error();
        spans.push(...detected);
      } catch { throw new PrivacyUnavailableError(); }
    }
    // Union overlapping spans, so a shorter recognizer cannot leak the remainder of a larger entity.
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: PIISpan[] = [];
    for (const span of spans) {
      const previous = merged[merged.length - 1];
      if (previous && span.start < previous.end) previous.end = Math.max(previous.end, span.end);
      else merged.push({ ...span });
    }
    let output = "", offset = 0;
    for (const span of merged) {
      const original = text.slice(span.start, span.end);
      let token = this.tokens.get(original);
      if (!token) {
        token = `[${this.prefix}${span.entity}_${this.values.size + 1}]`;
        this.tokens.set(original, token); this.values.set(token, original);
      }
      output += text.slice(offset, span.start) + token;
      offset = span.end;
    }
    return { text: output + text.slice(offset), summary: {
      strategy: this.options.analyzer ? "patterns_and_ner" : "local_patterns", replacements: merged.length,
    } };
  }
  /** Restore the complete response. For SSE buffer unfinished placeholders; never restore chunks independently. */
  restore(text: string): string {
    if (this.disposed) throw new Error("disposed");
    let result = text;
    this.values.forEach((original, token) => { result = result.split(token).join(original); });
    return result;
  }
  /** Hold possible split placeholders; ordinary text remains streamed. */
  streamRestorer() {
    let pending = "";
    const prefix = `[${this.prefix}`;
    return (chunk: string, final = false): string => {
      pending += chunk;
      if (final) { const result = this.restore(pending); pending = ""; return result; }
      const start = pending.lastIndexOf("[");
      if (start >= 0) {
        const tail = pending.slice(start);
        if ((prefix.startsWith(tail) || tail.startsWith(prefix)) && !tail.includes("]") && tail.length < 160) {
          const result = this.restore(pending.slice(0, start)); pending = tail; return result;
        }
      }
      const result = this.restore(pending); pending = ""; return result;
    };
  }
  dispose(): void { this.tokens.clear(); this.values.clear(); this.disposed = true; }
}

/** Trusted server configuration only. Presidio receives raw text: host it inside the private processing perimeter.
 * Python analyzer offsets are Unicode code points; convert them to JS UTF-16 offsets.
 */
export function createPresidioAnalyzer(baseUrl: string, fetcher: typeof fetch = fetch, autoLanguage = false): PIIAnalyzer {
  const endpoint = new URL("analyze", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("invalid_presidio_url");
  return async (text, language) => {
    const response = await fetcher(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", ...engineHeaders() },
      body: JSON.stringify({ text, language: autoLanguage ? "auto" : language, entities: ["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "LOCATION", "IBAN_CODE", "CREDIT_CARD", "IP_ADDRESS"] }),
      signal: AbortSignal.timeout(30000), cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new PrivacyUnavailableError();
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length > 10000) throw new PrivacyUnavailableError();
    const offsets = [0];
    for (const point of Array.from(text)) offsets.push(offsets[offsets.length - 1] + point.length);
    const entities: Record<string, PIIEntity> = { PERSON: "PERSON", EMAIL_ADDRESS: "EMAIL", PHONE_NUMBER: "PHONE", LOCATION: "LOCATION", IBAN_CODE: "IDENTIFIER", CREDIT_CARD: "IDENTIFIER", IP_ADDRESS: "IDENTIFIER" };
    return body.map(row => {
      if (!row || typeof row !== "object") throw new PrivacyUnavailableError();
      const r = row as Record<string, unknown>;
      if (!Number.isInteger(r.start) || !Number.isInteger(r.end) || typeof r.entity_type !== "string" || !Object.prototype.hasOwnProperty.call(entities, r.entity_type) ||
          (r.start as number) < 0 || (r.end as number) <= (r.start as number) || (r.end as number) >= offsets.length) throw new PrivacyUnavailableError();
      return { start: offsets[r.start as number], end: offsets[r.end as number], entity: entities[r.entity_type] };
    });
  };
}
