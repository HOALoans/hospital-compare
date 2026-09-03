import type { Readable } from "stream";
import type { ParsedCodeCharges } from "./parseCsv.js";
import { ingestItem } from "./parseJson.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function findMatchingBraceEnd(buf: Buffer, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < buf.length; i++) {
    const ch = buf[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === 0x5c) escape = true;
      else if (ch === 0x22) inString = false;
      continue;
    }
    if (ch === 0x22) {
      inString = true;
      continue;
    }
    if (ch === 0x7b) depth += 1;
    else if (ch === 0x7d) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Fast path for huge minified MRFs when we only need a handful of HCPCS codes.
 * Scans for `"code":"XXXX"` and parses the parent charge item (object that owns `description`).
 */
export async function extractFilteredCodesFromJsonStream(
  readable: Readable,
  acc: Map<string, ParsedCodeCharges>,
  codeFilter: Set<string>,
): Promise<number> {
  const needles = [...codeFilter].map((c) => ({
    code: c,
    buf: Buffer.from(`"code":"${c}"`),
  }));
  const remaining = new Set(codeFilter);
  let buf: Buffer = Buffer.alloc(0);
  let parsedObjects = 0;
  let chunks = 0;
  const WINDOW = 6_000_000;

  const tryExtract = (at: number): boolean => {
    // Charge items always have a description field near the code list.
    const descAt = buf.lastIndexOf('"description"', at);
    if (descAt < 0 || at - descAt > 80_000) {
      // description not in buffer yet / too far — wait for more data if near end
      return at > 1000;
    }
    const start = buf.lastIndexOf("{", descAt);
    if (start < 0) return true;
    const end = findMatchingBraceEnd(buf, start);
    if (end < 0) return false; // need more bytes
    if (end - start > 12_000_000) return true;

    try {
      const rec = asRecord(JSON.parse(buf.subarray(start, end + 1).toString("utf8")));
      if (!rec) return true;
      ingestItem(rec, acc, { codeFilter });
      parsedObjects += 1;
      for (const code of codeFilter) {
        const row = acc.get(code);
        if (row && (row.cash.length > 0 || row.negotiated.length > 0)) remaining.delete(code);
      }
    } catch {
      /* ignore incomplete/bad slice */
    }
    return true;
  };

  for await (const chunk of readable) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    buf = buf.length ? (Buffer.concat([buf, piece] as Buffer[]) as Buffer) : piece;
    chunks += 1;

    for (const needle of needles) {
      if (!remaining.has(needle.code)) continue;
      let from = 0;
      while (from < buf.length) {
        const at = buf.indexOf(needle.buf, from);
        if (at < 0) break;
        const ok = tryExtract(at);
        if (!ok) break;
        from = at + needle.buf.length;
      }
    }

    if (remaining.size === 0) {
      readable.destroy();
      break;
    }

    if (buf.length > WINDOW) buf = buf.subarray(buf.length - WINDOW) as Buffer;

    if (chunks % 8 === 0) await new Promise<void>((r) => setImmediate(r));
  }

  return parsedObjects;
}
