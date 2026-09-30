import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

// Symmetric encryption for stored provider secrets (BYOK keys, OAuth tokens).
// Key material comes from ENCRYPTION_KEY (preferred) or JWT_SECRET.
const SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "thesisfy-mvp-dev-secret-key-2024";
let cachedKey: Buffer | null = null;
function key() {
  if (!cachedKey) cachedKey = scryptSync(SECRET, "thesisfy-connections", 32);
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
