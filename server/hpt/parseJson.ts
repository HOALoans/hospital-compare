import fs from "fs";
import { isHcpcsType, parseMoney, type ParsedCodeCharges } from "./parseCsv.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function ingestItem(item: Record<string, unknown>, acc: Map<string, ParsedCodeCharges>) {
  const codes: { code: string; type: string }[] = [];
  const codeInfo = item.code_information ?? item.codeInformation ?? item.codes;
  if (Array.isArray(codeInfo)) {
    for (const c of codeInfo) {
      const o = asRecord(c);
      if (!o) continue;
      codes.push({ code: String(o.code ?? o.billing_code ?? "").toUpperCase(), type: String(o.type ?? o.code_type ?? "") });
    }
  } else {
    const code = String(item.code ?? item.billing_code ?? "").toUpperCase();
    const type = String(item.code_type ?? item.billing_code_type ?? item.type ?? "");
    if (code) codes.push({ code, type });
  }

  const hcpcs = codes.filter(
    (c) => c.code && (isHcpcsType(c.type) || (!c.type && /^[A-Z]?\d{4,5}[A-Z]?$/.test(c.code))),
  );
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
      const cash = parseMoney(o.discounted_cash ?? o.discountedCash ?? o.cash);
      if (cash != null) pushCapped(row.cash, cash);

      const payers = o.payers_information ?? o.payersInformation ?? o.payers;
      if (Array.isArray(payers)) {
        for (const p of payers) {
          const po = asRecord(p);
          const neg = parseMoney(po?.standard_charge_dollar ?? po?.negotiated_dollar ?? po?.standard_charge);
          if (neg != null) pushCapped(row.negotiated, neg);
        }
      }
      const neg = parseMoney(o.negotiated_dollar ?? o.standard_charge_dollar);
      if (neg != null) pushCapped(row.negotiated, neg);
    }
  }
}

/** Cap per-code samples so multi-payer MRFs don't OOM on free-tier RAM. */
const MAX_SAMPLES = 2_500;
function pushCapped(arr: number[], value: number) {
  if (arr.length < MAX_SAMPLES) {
    arr.push(value);
    return;
  }
  // Reservoir sample so late payers still influence the distribution.
  const i = Math.floor(Math.random() * (arr.length + 1));
  if (i < MAX_SAMPLES) arr[i] = value;
}

function walk(node: unknown, acc: Map<string, ParsedCodeCharges>, depth = 0) {
  if (depth > 6 || node == null) return;
  if (Array.isArray(node)) {
    for (const el of node) walk(el, acc, depth + 1);
    return;
  }
  const o = asRecord(node);
  if (!o) return;
  const list = o.standard_charge_information ?? o.standardChargeInformation;
  if (Array.isArray(list)) {
    for (const item of list) {
      const rec = asRecord(item);
      if (rec) ingestItem(rec, acc);
    }
    return;
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walk(v, acc, depth + 1);
  }
}

export function parseMrfJson(text: string, acc: Map<string, ParsedCodeCharges>) {
  const json = JSON.parse(text) as unknown;
  const root = asRecord(json);
  const list =
    (root && (root.standard_charge_information || root.standardChargeInformation || root.item_information)) ?? json;
  if (Array.isArray(list)) {
    for (const item of list) {
      const o = asRecord(item);
      if (o) ingestItem(o, acc);
    }
    return;
  }
  walk(json, acc);
}

/**
 * Stream a CMS JSON MRF without loading the full document into memory.
 * Looks for a top-level array of charge items (`standard_charge_information` or root `[...]`)
 * and JSON.parse()'s each object individually.
 */
export async function streamParseMrfJsonFile(file: string, acc: Map<string, ParsedCodeCharges>): Promise<number> {
  const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1024 * 256 });
  let buf = "";
  const state: { mode: "seek" | "array" | "done" } = { mode: "seek" };
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  let items = 0;

  const ARRAY_KEYS = [
    '"standard_charge_information"',
    '"standardChargeInformation"',
    '"item_information"',
    '"itemInformation"',
  ];

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
            const slice = buf.slice(objStart, i + 1);
            try {
              const obj = JSON.parse(slice) as unknown;
              const rec = asRecord(obj);
              if (rec) {
                ingestItem(rec, acc);
                items += 1;
              }
            } catch {
              /* skip malformed object */
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

    if (state.mode === "array" && objStart > 0 && objStart > 1_000_000) {
      buf = buf.slice(objStart);
      objStart = 0;
    }
  };

  for await (const chunk of stream) {
    if (state.mode === "done") break;
    processChunk(chunk);
    // Yield after each ~256KB chunk so Express can serve requests mid-parse.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (state.mode !== "done" && buf.length) processChunk("");

  return items;
}
