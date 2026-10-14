/**
 * Minimal ZIP reader for uploaded .xlsx and .docx files (docs/papers.md §3.3), built on Node's zlib only.
 *
 * - The end of central directory record (EOCD) is searched in the last 64 KB; the central directory gives the entry
 *   list and the sizes. Local headers are read only to find where an entry's data starts: their sizes can be zero
 *   when bit 3 (data descriptor) is set, so the central directory sizes are the ones trusted.
 * - Methods 0 (stored) and 8 (deflate). No ZIP64, no multi-disk archives, no encryption (bit 0): each is refused.
 * - Bombs: at most 2 000 entries; every inflate is bounded by `maxOutputLength` (the declared size, so a lying header
 *   fails instead of expanding) and all reads share one budget of 60 MB of inflated bytes. Only the entries a parser
 *   asks for are inflated. `readPrefix` reads the start of a large entry (a huge sheet) without inflating all of it.
 *
 * Server only (zlib). Errors are `ZipError` with a code the upload route maps to a translated message.
 */
import zlib from "zlib";

export type ZipErrorCode = "not_zip" | "corrupt" | "unsupported" | "encrypted" | "too_large";

export class ZipError extends Error {
  code: ZipErrorCode;
  constructor(code: ZipErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    this.name = "ZipError";
  }
}

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_INFLATED_BYTES = 60 * 1024 * 1024;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

export interface ZipEntry {
  /** Name as stored, with "/" separators and no leading slash. */
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export interface ZipArchive {
  /** Entry names in central directory order. */
  names: string[];
  /** Case-insensitive lookup (OPC part names are case-insensitive); a leading "/" is ignored. */
  entry(name: string): ZipEntry | undefined;
  /** Inflated bytes of an entry, or null when it does not exist. Throws `ZipError` past the budget or when broken. */
  read(name: string): Buffer | null;
  /** UTF-8 (or UTF-16 with BOM) text of an entry, or null when it does not exist. */
  readText(name: string): string | null;
  /**
   * At most `maxBytes` inflated bytes from the start of an entry: the whole entry when it fits, otherwise a prefix
   * (`cut: true`). Lets a parser walk the first rows of a huge sheet within the budget. Null when it does not exist.
   */
  readPrefixText(name: string, maxBytes: number): { text: string; cut: boolean } | null;
  /** Inflated bytes still allowed by the budget. */
  remaining(): number;
}

export interface ZipOptions {
  maxEntries?: number;
  maxInflatedBytes?: number;
}

export function looksLikeZip(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function normName(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "");
}

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    // A signature inside the comment would not end exactly at the end of the file (some writers pad: allow ≤ 64 bytes).
    if (i + 22 + commentLen <= buf.length && buf.length - (i + 22 + commentLen) <= 64) return i;
  }
  return -1;
}

/** Decodes XML or text bytes: UTF-16 with a BOM, otherwise UTF-8 (a UTF-8 BOM is dropped). */
export function decodeXmlBytes(b: Buffer): string {
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le", 2);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    const swapped = Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1)));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.toString("utf8", 3);
  return b.toString("utf8");
}

/** Opens a ZIP held in memory. Throws `ZipError` ("not_zip", "corrupt", "unsupported", "encrypted", "too_large"). */
export function openZip(buf: Buffer, opts: ZipOptions = {}): ZipArchive {
  const maxEntries = opts.maxEntries ?? MAX_ZIP_ENTRIES;
  let budget = opts.maxInflatedBytes ?? MAX_ZIP_INFLATED_BYTES;
  if (!looksLikeZip(buf) || buf.length < 22) throw new ZipError("not_zip");
  const eocd = findEocd(buf);
  if (eocd < 0) throw new ZipError("corrupt", "No end of central directory (truncated file?)");
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCATOR) throw new ZipError("unsupported", "ZIP64 archives are not supported");
  const disk = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const countHere = buf.readUInt16LE(eocd + 8);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("unsupported", "ZIP64 archives are not supported");
  if (disk !== 0 || cdDisk !== 0 || countHere !== count) throw new ZipError("unsupported", "Multi-part archives are not supported");
  if (count > maxEntries) throw new ZipError("too_large", `More than ${maxEntries} entries`);
  if (cdOffset + cdSize > eocd) throw new ZipError("corrupt", "Central directory out of range");

  const entries: ZipEntry[] = [];
  const byName = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== SIG_CENTRAL) throw new ZipError("corrupt", "Bad central directory entry");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen > eocd) throw new ZipError("corrupt", "Bad central directory entry");
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new ZipError("unsupported", "ZIP64 entries are not supported");
    const name = normName(buf.toString("utf8", p + 46, p + 46 + nameLen));
    const e: ZipEntry = { name, method, flags, compressedSize, size, localOffset };
    entries.push(e);
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, e);
    p += 46 + nameLen + extraLen + commentLen;
  }

  const entry = (name: string) => byName.get(normName(name).toLowerCase());

  function dataOf(e: ZipEntry): Buffer {
    if (e.flags & 0x1) throw new ZipError("encrypted", "Encrypted entry");
    if (e.method !== 0 && e.method !== 8) throw new ZipError("unsupported", `Compression method ${e.method}`);
    const lo = e.localOffset;
    if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== SIG_LOCAL) throw new ZipError("corrupt", "Bad local header");
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    if (start + e.compressedSize > buf.length) throw new ZipError("corrupt", "Entry data out of range (truncated file?)");
    return buf.subarray(start, start + e.compressedSize);
  }

  function spend(n: number) {
    if (n > budget) throw new ZipError("too_large", "Inflated size budget exceeded");
    budget -= n;
  }

  function read(name: string): Buffer | null {
    const e = entry(name);
    if (!e) return null;
    const data = dataOf(e);
    if (e.size > budget) throw new ZipError("too_large", "Inflated size budget exceeded");
    if (e.method === 0) {
      if (e.compressedSize !== e.size) throw new ZipError("corrupt", "Stored entry with mismatched sizes");
      spend(e.size);
      return Buffer.from(data);
    }
    if (e.size === 0) return Buffer.alloc(0);
    let out: Buffer;
    try {
      // The declared size bounds the output: an entry that inflates to more than it declares fails here.
      out = zlib.inflateRawSync(data, { maxOutputLength: e.size });
    } catch (err) {
      throw new ZipError("corrupt", `Entry could not be inflated: ${(err as Error).message}`);
    }
    spend(out.length);
    return out;
  }

  function readPrefixText(name: string, maxBytes: number): { text: string; cut: boolean } | null {
    const e = entry(name);
    if (!e) return null;
    const cap = Math.min(maxBytes, budget);
    if (e.size <= cap) {
      const whole = read(name);
      return whole ? { text: decodeXmlBytes(whole), cut: false } : null;
    }
    if (cap <= 0) throw new ZipError("too_large", "Inflated size budget exceeded");
    const data = dataOf(e);
    if (e.method === 0) {
      spend(cap);
      return { text: decodeXmlBytes(Buffer.from(data.subarray(0, cap))), cut: true };
    }
    // Inflate growing prefixes of the compressed data (Z_SYNC_FLUSH accepts a cut stream) until the output is about
    // `cap` bytes; an output above `cap` fails with maxOutputLength and the prefix shrinks. Each try is bounded.
    let take = Math.min(data.length, Math.max(4096, Math.floor(cap / 32)));
    let best: Buffer | null = null;
    for (let i = 0; i < 24; i++) {
      let out: Buffer | null = null;
      try {
        out = zlib.inflateRawSync(data.subarray(0, take), { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: cap });
      } catch (err) {
        if ((err as { code?: string }).code !== "ERR_BUFFER_TOO_LARGE" && !/larger than|buffer/i.test((err as Error).message)) {
          throw new ZipError("corrupt", `Entry could not be inflated: ${(err as Error).message}`);
        }
        take = Math.floor(take / 2);
        if (take < 64) break;
        continue;
      }
      best = out;
      if (out.length >= cap / 2 || take >= data.length) break;
      take = Math.min(data.length, take * 2);
    }
    if (!best) throw new ZipError("too_large", "Entry expands too much to be read");
    spend(best.length);
    return { text: decodeXmlBytes(best), cut: true };
  }

  return {
    names: entries.map((e) => e.name),
    entry,
    read,
    readText: (name: string) => {
      const b = read(name);
      return b ? decodeXmlBytes(b) : null;
    },
    readPrefixText,
    remaining: () => budget,
  };
}
