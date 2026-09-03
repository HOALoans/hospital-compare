import { isHcpcsType, parseMoney, type ParsedCodeCharges } from "./parseCsv.js";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function ingestItem(item: Record<string, unknown>, acc: Map<string, ParsedCodeCharges>) {
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

  const hcpcs = codes.filter((c) => c.code && (isHcpcsType(c.type) || (!c.type && /^[A-Z]?\d{4,5}[A-Z]?$/.test(c.code))));
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
      if (cash != null) row.cash.push(cash);

      const payers = o.payers_information ?? o.payersInformation ?? o.payers;
      if (Array.isArray(payers)) {
        for (const p of payers) {
          const po = asRecord(p);
          const neg = parseMoney(po?.standard_charge_dollar ?? po?.negotiated_dollar ?? po?.standard_charge);
          if (neg != null) row.negotiated.push(neg);
        }
      }
      const neg = parseMoney(o.negotiated_dollar ?? o.standard_charge_dollar);
      if (neg != null) row.negotiated.push(neg);
    }
  }
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
