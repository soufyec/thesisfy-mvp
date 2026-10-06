import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

// Symmetric encryption for stored provider secrets (BYOK keys, OAuth tokens).
// Key material comes from ENCRYPTION_KEY (preferred) or JWT_SECRET.
const SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "thesisfy-mvp-dev-secret-key-2024";
let cachedKey: Buffer | null = null;
function key() {
  if (!cachedKey) cachedKey = scryptSync(SECRET, "thesisfic-connections", 32);
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Normalised SHA-256 of a text snippet, used to match copied/pasted text across sources without storing the text. */
export function textFingerprint(text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/** Split text into the units a student is likely to copy: paragraphs and sentences of at least `minWords` words. */
export function passages(text: string, minWords = 8, max = 80): string[] {
  const out = new Set<string>();
  // Strip Markdown so a sentence copied from the rendered answer matches the raw one: emphasis, headings, quotes,
  // list markers, links and inline code.
  const clean = (t: string) =>
    t
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`#>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const whole = clean(text);
  const words = (t: string) => (t ? t.split(" ").length : 0);
  if (words(whole) >= minWords) out.add(whole);
  for (const para of text.split(/\n+/)) {
    const cp = clean(para);
    if (words(cp) >= minWords) out.add(cp);
    for (const sentence of cp.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÈÙÂÊÎÔÛÇ0-9"'(])/)) {
      const cs = sentence.trim();
      if (words(cs) >= minWords) out.add(cs);
    }
    if (out.size >= max) break;
  }
  return Array.from(out).slice(0, max);
}

/** Fingerprints of every paragraph and sentence of a text, for later matching without storing the text. */
export function passageFingerprints(text: string): string[] {
  return passages(text).map(textFingerprint);
}
