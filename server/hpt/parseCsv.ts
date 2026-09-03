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

interface ColMap {
  code: number;
  type: number | null;
  desc: number | null;
  cash: number | null;
  negotiated: number | null;
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

  const type =
    find(
      (s) => s.includes("code") && s.includes("type") && !s.includes("2"),
      (s) => s === "billing_code_type" || s === "code_type",
    );
  const code =
    find(
      (s) => s === "code" || s === "billing_code" || s === "code_1",
      (s) => /(^|_)code$/.test(s) && !s.includes("type") && !s.includes("modifier"),
      (s) => s.includes("billing_code") && !s.includes("type"),
    );
  if (code == null) return null;

  return {
    code,
    type,
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
    charge: find((s) => s === "standard_charge" || s === "standard_charge_amount"),
    chargeType: find(
      (s) => s.includes("standard_charge") && (s.includes("type") || s.includes("methodology") || s.includes("setting") === false) && s.includes("type"),
      (s) => s === "standard_charge_type" || s === "charge_type",
    ),
  };
}

export function ingestCsvRow(cols: string[], map: ColMap, acc: Map<string, ParsedCodeCharges>) {
  const code = (cols[map.code] ?? "").trim().toUpperCase();
  if (!code || code.length > 12) return;
  const type = map.type != null ? cols[map.type] : "";
  if (map.type != null && !isHcpcsType(type)) return;
  if (map.type == null && !/^[A-Z]?\d{4,5}[A-Z]?$/.test(code)) return;

  let row = acc.get(code);
  if (!row) {
    row = { description: null, cash: [], negotiated: [] };
    acc.set(code, row);
  }
  if (!row.description && map.desc != null) {
    const d = cols[map.desc]?.trim();
    if (d) row.description = d.slice(0, 180);
  }

  const cash = map.cash != null ? parseMoney(cols[map.cash]) : null;
  if (cash != null) row.cash.push(cash);

  const neg = map.negotiated != null ? parseMoney(cols[map.negotiated]) : null;
  if (neg != null) row.negotiated.push(neg);

  if (map.charge != null) {
    const amt = parseMoney(cols[map.charge]);
    if (amt != null) {
      const ct = (map.chargeType != null ? cols[map.chargeType] : "")?.toLowerCase() ?? "";
      if (/cash|discount/.test(ct)) row.cash.push(amt);
      else if (/negotiat|payer/.test(ct)) row.negotiated.push(amt);
    }
  }
}

export function detectDelimiter(headerLine: string): string {
  const counts: [string, number][] = [
    [",", (headerLine.match(/,/g) ?? []).length],
    ["|", (headerLine.match(/\|/g) ?? []).length],
    ["\t", (headerLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![0];
}

export function mapCsvHeaderLine(headerLine: string): { delimiter: string; map: ColMap } | null {
  const delimiter = detectDelimiter(headerLine);
  const headers = parseCsvLine(headerLine.replace(/^\ufeff/, ""), delimiter);
  const map = mapHeader(headers);
  if (!map) return null;
  return { delimiter, map };
}

export { type ColMap };
