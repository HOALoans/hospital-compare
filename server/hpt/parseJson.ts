import fs from "fs";
import type { Readable } from "stream";
import { isHcpcsType, parseMoney, type ParsedCodeCharges } from "./parseCsv.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export interface JsonParseOpts {
  /** When set, only keep these HCPCS/CPT codes (huge MRFs stay memory-safe). */
  codeFilter?: Set<string> | null;
}

export function ingestItem(
  item: Record<string, unknown>,
  acc: Map<string, ParsedCodeCharges>,
  opts: JsonParseOpts = {},
) {
  const codes: { code: string; type: string }[] = [];
  const codeInfo = item.code_information ?? item.codeInformation ?? item.codes;
  if (Array.isArray(codeInfo)) {
    for (const c of codeInfo) {
      const o = asRecord(c);
      if (!o) continue;
      codes.push({
        code: String(o.code ?? o.billing_code ?? "").toUpperCase(),
        type: String(o.type ?? o.code_type ?? ""),
      });
    }
  } else {
    const code = String(item.code ?? item.billing_code ?? "").toUpperCase();
    const type = String(item.code_type ?? item.billing_code_type ?? item.type ?? "");
    if (code) codes.push({ code, type });
  }

  let hcpcs = codes.filter(
    (c) => c.code && (isHcpcsType(c.type) || (!c.type && /^[A-Z]?\d{4,5}[A-Z]?$/.test(c.code))),
  );
  if (opts.codeFilter && opts.codeFilter.size > 0) {
    hcpcs = hcpcs.filter((c) => opts.codeFilter!.has(c.code));
  }
  if (hcpcs.length === 0) return;

  const desc = String(item.description ?? item.item_description ?? "").trim().slice(0, 180) || null;
  const charges = item.standard_charges ?? item.standardCharges ?? item.standard_charge_information;
  const chargeList = Array.isArray(charges) ? charges : [item];

  for (const target of hcpcs) {
    let row = acc.get(target.code);
    if (!row) {
      row = { description: desc, cash: [], negotiated: [] };
      acc.set(target.code, row);
    } else if (!row.description && desc) row.description = desc;

    for (const ch of chargeList) {
      const o = asRecord(ch) ?? {};
      const cash = parseMoney(o.discounted_cash ?? o.discountedCash ?? o.cash ?? o.gross_charge ?? o.grossCharge);
      if (cash != null) pushCapped(row.cash, cash);

      const min = parseMoney(o.minimum);
      const max = parseMoney(o.maximum);
      if (min != null) pushCapped(row.negotiated, min);
      if (max != null) pushCapped(row.negotiated, max);

      const payers = o.payers_information ?? o.payersInformation ?? o.payers;
      if (Array.isArray(payers)) {
        // Don't walk tens of thousands of payer rows when we only need a sample.
        const limit = Math.min(payers.length, 400);
        for (let i = 0; i < limit; i++) {
          const po = asRecord(payers[i]);
          const neg = parseMoney(
            po?.standard_charge_dollar ??
              po?.negotiated_dollar ??
              po?.median_amount ??
              po?.["median_amount"] ??
              po?.standard_charge,
          );
          if (neg != null) pushCapped(row.negotiated, neg);
        }
      }
      const neg = parseMoney(o.negotiated_dollar ?? o.standard_charge_dollar);
      if (neg != null) pushCapped(row.negotiated, neg);
    }
  }
}

const MAX_SAMPLES = 800;
function pushCapped(arr: number[], value: number) {
  if (arr.length < MAX_SAMPLES) {
    arr.push(value);
    return;
  }
  const i = Math.floor(Math.random() * (arr.length + 1));
  if (i < MAX_SAMPLES) arr[i] = value;
}

function walk(node: unknown, acc: Map<string, ParsedCodeCharges>, opts: JsonParseOpts, depth = 0) {
  if (depth > 6 || node == null) return;
  if (Array.isArray(node)) {
    for (const el of node) walk(el, acc, opts, depth + 1);
    return;
  }
  const o = asRecord(node);
  if (!o) return;
  const list = o.standard_charge_information ?? o.standardChargeInformation;
  if (Array.isArray(list)) {
    for (const item of list) {
      const rec = asRecord(item);
      if (rec) ingestItem(rec, acc, opts);
    }
    return;
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walk(v, acc, opts, depth + 1);
  }
}

export function parseMrfJson(text: string, acc: Map<string, ParsedCodeCharges>, opts: JsonParseOpts = {}) {
  const json = JSON.parse(text) as unknown;
  const root = asRecord(json);
  const list =
    (root && (root.standard_charge_information || root.standardChargeInformation || root.item_information)) ??
    json;
  if (Array.isArray(list)) {
    for (const item of list) {
      const o = asRecord(item);
      if (o) ingestItem(o, acc, opts);
    }
    return;
  }
  walk(json, acc, opts);
}

const MAX_OBJECT_CHARS = 8_000_000;

/**
 * Stream a CMS JSON MRF from any async iterable of strings (file or HTTP body)
 * without loading the full document into memory.
 */
export async function streamParseMrfJson(
  stream: AsyncIterable<string | Buffer>,
  acc: Map<string, ParsedCodeCharges>,
  opts: JsonParseOpts & { onProgress?: (items: number) => void; signal?: AbortSignal } = {},
): Promise<number> {
  let buf = "";
  const state: { mode: "seek" | "array" | "done" } = { mode: "seek" };
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  let items = 0;
  let chunks = 0;
  let skippedHuge = 0;

  const ARRAY_KEYS = [
    '"standard_charge_information"',
    '"standardChargeInformation"',
    '"item_information"',
    '"itemInformation"',
  ];

  const filterComplete = () => {
    if (!opts.codeFilter || opts.codeFilter.size === 0) return false;
    for (const code of opts.codeFilter) {
      const row = acc.get(code);
      if (!row || (row.cash.length === 0 && row.negotiated.length === 0)) return false;
    }
    return true;
  };

  const processChunk = (chunk: string) => {
    if (state.mode === "done") return;
    buf += chunk;
    let i = 0;
    while (i < buf.length) {
      if (state.mode === "seek") {
        let found = -1;
        let afterKey = -1;
        for (const key of ARRAY_KEYS) {
          const at = buf.indexOf(key, i);
          if (at >= 0 && (found < 0 || at < found)) {
            found = at;
            afterKey = at + key.length;
          }
        }
        if (found >= 0) {
          const bracket = buf.indexOf("[", afterKey);
          if (bracket < 0) {
            buf = buf.slice(found);
            return;
          }
          state.mode = "array";
          i = bracket + 1;
          continue;
        }
        const rootArr = buf.indexOf("[", i);
        const rootObj = buf.indexOf("{", i);
        if (rootArr >= 0 && (rootObj < 0 || rootArr < rootObj)) {
          state.mode = "array";
          i = rootArr + 1;
          continue;
        }
        if (buf.length > 64_000) buf = buf.slice(-8_000);
        return;
      }

      if (state.mode === "array") {
        const ch = buf[i]!;
        if (inString) {
          if (escape) escape = false;
          else if (ch === "\\") escape = true;
          else if (ch === '"') inString = false;
          i += 1;
          continue;
        }
        if (ch === '"') {
          inString = true;
          i += 1;
          continue;
        }
        if (ch === "{") {
          if (depth === 0) objStart = i;
          depth += 1;
          i += 1;
          continue;
        }
        if (ch === "}") {
          depth -= 1;
          if (depth === 0 && objStart >= 0) {
            const len = i + 1 - objStart;
            if (len <= MAX_OBJECT_CHARS) {
              const slice = buf.slice(objStart, i + 1);
              try {
                const obj = JSON.parse(slice) as unknown;
                const rec = asRecord(obj);
                if (rec) {
                  ingestItem(rec, acc, opts);
                  items += 1;
                }
              } catch {
                /* skip malformed object */
              }
            } else {
              skippedHuge += 1;
            }
            buf = buf.slice(i + 1);
            i = 0;
            objStart = -1;
            continue;
          }
          i += 1;
          continue;
        }
        if (ch === "]" && depth === 0) {
          state.mode = "done";
          return;
        }
        i += 1;
        continue;
      }

      return;
    }

    if (state.mode === "array" && objStart > 0 && objStart > 500_000) {
      buf = buf.slice(objStart);
      objStart = 0;
    }
  };

  for await (const chunk of stream) {
    if (opts.signal?.aborted) break;
    if (state.mode === "done") break;
    processChunk(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    chunks += 1;
    if (chunks % 4 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      opts.onProgress?.(items);
    }
    // For filtered on-demand crawls, stop as soon as every requested code has a value.
    if (filterComplete()) {
      state.mode = "done";
      break;
    }
  }
  if (state.mode !== "done" && buf.length) processChunk("");

  if (skippedHuge > 0) {
    console.log(`[hpt] skipped ${skippedHuge} oversized JSON charge objects`);
  }
  return items;
}

export async function streamParseMrfJsonFile(
  file: string,
  acc: Map<string, ParsedCodeCharges>,
  opts: JsonParseOpts = {},
): Promise<number> {
  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1024 * 256 });
  return streamParseMrfJson(stream as unknown as AsyncIterable<string>, acc, opts);
}

export async function streamParseMrfJsonReadable(
  readable: Readable,
  acc: Map<string, ParsedCodeCharges>,
  opts: JsonParseOpts = {},
): Promise<number> {
  readable.setEncoding("utf8");
  try {
    return await streamParseMrfJson(readable as AsyncIterable<string>, acc, opts);
  } finally {
    readable.destroy();
  }
}
