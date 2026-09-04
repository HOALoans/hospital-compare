import { mean, median } from "./stats.js";

const HCPCS_TYPE = /^(hcpcs|cpt|cpt-4|cpt4|hcpc|hcpcs[-_ ]?[12])$/i;
const SKIP_TYPE = /^(ms-?drg|drg|ndc|rc|cdm|local|hipps|apc|cdt|icd|eapg|rev)/i;

export interface ParsedCodeCharges {
  description: string | null;
  cash: number[];
  negotiated: number[];
}

export function isHcpcsType(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const t = raw.trim();
  if (SKIP_TYPE.test(t)) return false;
  return HCPCS_TYPE.test(t);
}

export function parseMoney(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const s = String(raw).trim().replace(/[$,]/g, "");
  if (!s || /n\/?a|not available|null/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null;
}

export function collapseCode(row: ParsedCodeCharges): {
  description: string | null;
  cash: number | null;
  allMean: number | null;
  allMedian: number | null;
  allN: number;
} {
  return {
    description: row.description,
    cash: median(row.cash),
    allMean: mean(row.negotiated),
    allMedian: median(row.negotiated),
    allN: row.negotiated.length,
  };
}

export function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/^\ufeff/, "").replace(/[\s|]+/g, "_").replace(/_+/g, "_");
}

export interface CodeSlot {
  code: number;
  type: number | null;
}

export interface ColMap {
  /** Primary code column (legacy tall files). */
  code: number;
  type: number | null;
  /** CMS wide files often have code|1..code|3 with types. */
  codeSlots: CodeSlot[];
  desc: number | null;
  cash: number | null;
  negotiated: number | null;
  /** All payer-specific negotiated_dollar columns (wide CMS format). */
  negotiatedCols: number[];
  charge: number | null;
  chargeType: number | null;
}

function mapHeader(headers: string[]): ColMap | null {
  const h = headers.map(normHeader);
  const find = (...preds: ((s: string) => boolean)[]) => {
    for (const pred of preds) {
      const i = h.findIndex(pred);
      if (i >= 0) return i;
    }
    return null;
  };

  const codeSlots: CodeSlot[] = [];
  for (let n = 1; n <= 5; n++) {
    const codeIdx = h.findIndex((s) => s === `code_${n}` || s === `code${n}`);
    if (codeIdx < 0) continue;
    const typeIdx = h.findIndex(
      (s) => s === `code_${n}_type` || s === `code${n}_type` || s === `code_${n}type`,
    );
    codeSlots.push({ code: codeIdx, type: typeIdx >= 0 ? typeIdx : null });
  }

  const type = find(
    (s) => s.includes("code") && s.includes("type") && !s.includes("2") && !/^code_\d/.test(s),
    (s) => s === "billing_code_type" || s === "code_type",
  );
  const code = find(
    (s) => s === "code" || s === "billing_code" || s === "code_1",
    (s) => /(^|_)code$/.test(s) && !s.includes("type") && !s.includes("modifier"),
    (s) => s.includes("billing_code") && !s.includes("type"),
  );

  if (code == null && codeSlots.length === 0) return null;

  const negotiatedCols = h
    .map((s, i) => (s.includes("negotiated_dollar") ? i : -1))
    .filter((i) => i >= 0);

  const primaryCode = code ?? codeSlots[0]!.code;
  const primaryType = type ?? codeSlots[0]?.type ?? null;
  if (codeSlots.length === 0) {
    codeSlots.push({ code: primaryCode, type: primaryType });
  }

  return {
    code: primaryCode,
    type: primaryType,
    codeSlots,
    desc: find((s) => s === "description" || s.endsWith("_description") || s === "item_description"),
    cash: find(
      (s) => s.includes("discounted_cash") || s.includes("cash_price") || s === "discounted_cash",
      (s) => s.includes("cash") && s.includes("charge"),
    ),
    negotiated: find(
      (s) => s.includes("negotiated_dollar") || s.includes("negotiated_charge"),
      (s) => s.includes("standard_charge_dollar"),
      (s) => s.includes("payer_specific") && s.includes("dollar"),
    ),
    negotiatedCols,
    charge: find((s) => s === "standard_charge" || s === "standard_charge_amount"),
    chargeType: find(
      (s) => s.includes("standard_charge") && s.includes("type"),
      (s) => s === "standard_charge_type" || s === "charge_type",
    ),
  };
}

function pushAmounts(cols: string[], map: ColMap, row: ParsedCodeCharges) {
  const cash = map.cash != null ? parseMoney(cols[map.cash]) : null;
  if (cash != null) row.cash.push(cash);

  if (map.negotiatedCols.length > 0) {
    for (const i of map.negotiatedCols) {
      const neg = parseMoney(cols[i]);
      if (neg != null) row.negotiated.push(neg);
    }
  } else {
    const neg = map.negotiated != null ? parseMoney(cols[map.negotiated]) : null;
    if (neg != null) row.negotiated.push(neg);
  }

  if (map.charge != null) {
    const amt = parseMoney(cols[map.charge]);
    if (amt != null) {
      const ct = (map.chargeType != null ? cols[map.chargeType] : "")?.toLowerCase() ?? "";
      if (/cash|discount/.test(ct)) row.cash.push(amt);
      else if (/negotiat|payer/.test(ct)) row.negotiated.push(amt);
    }
  }
}

export function ingestCsvRow(
  cols: string[],
  map: ColMap,
  acc: Map<string, ParsedCodeCharges>,
  opts?: { codeFilter?: Set<string> | null },
) {
  const targets: string[] = [];
  for (const slot of map.codeSlots) {
    const code = (cols[slot.code] ?? "").trim().toUpperCase();
    if (!code || code.length > 12) continue;
    const type = slot.type != null ? cols[slot.type] : map.type != null ? cols[map.type] : "";
    if (type && !isHcpcsType(type)) continue;
    if (!type && !/^[A-Z]?\d{4,5}[A-Z]?$/.test(code)) continue;
    if (opts?.codeFilter?.size && !opts.codeFilter.has(code)) continue;
    targets.push(code);
  }
  if (targets.length === 0) return;

  const desc = map.desc != null ? cols[map.desc]?.trim().slice(0, 180) || null : null;

  for (const code of [...new Set(targets)]) {
    let row = acc.get(code);
    if (!row) {
      row = { description: null, cash: [], negotiated: [] };
      acc.set(code, row);
    }
    if (!row.description && desc) row.description = desc;
    pushAmounts(cols, map, row);
  }
}

export function detectDelimiter(headerLine: string): string {
  // CMS column *names* often contain `|` (code|1, payer|plan|negotiated_dollar).
  // Prefer comma whenever it appears as a plausible field separator.
  const commas = (headerLine.match(/,/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs > commas && tabs >= 3) return "\t";
  if (commas >= 3) return ",";
  const pipes = (headerLine.match(/\|/g) ?? []).length;
  if (pipes >= 3) return "|";
  return ",";
}

/** True when a line looks like the charge-table header (not the hospital attestation row). */
export function looksLikeChargeHeader(line: string): boolean {
  const low = line.toLowerCase();
  if (!low.includes("description")) return false;
  return (
    /code\s*[|_]?\s*1/.test(low) ||
    low.includes("billing_code") ||
    /(?:^|,)"?code"?\s*,/.test(low) ||
    low.includes("code|1") ||
    low.includes(",code,")
  );
}

export function mapCsvHeaderLine(headerLine: string): { delimiter: string; map: ColMap } | null {
  const delimiter = detectDelimiter(headerLine);
  const headers = parseCsvLine(headerLine.replace(/^\ufeff/, ""), delimiter);
  const map = mapHeader(headers);
  if (!map) return null;
  return { delimiter, map };
}
