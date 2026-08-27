#!/usr/bin/env node
/**
 * Extract HCA Healthcare CCNs from an AHRQ Compendium Hospital Linkage CSV
 * and write seed/hca-national-facilities.json.
 *
 * Usage:
 *   npx tsx scripts/extractHcaFromAhrq.ts path/to/hospital-linkage.csv
 *
 * Expected columns (case-insensitive): ccn, health_sys_name (or system_name).
 * Rows whose system name matches /HCA/i are kept. NC Mission Health IDs are
 * always merged in.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { HCA_NC_FACILITY_IDS } from "../shared/hcaNcFacilities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "shared", "hca-national-facilities.json");
const OUT_SEED = path.join(ROOT, "seed", "hca-national-facilities.json");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(
      "Usage: npx tsx scripts/extractHcaFromAhrq.ts path/to/hospital-linkage.csv",
    );
    process.exit(1);
  }
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(abs, "utf8"));
  if (rows.length < 2) {
    console.error("CSV appears empty");
    process.exit(1);
  }
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const ccnIdx = header.findIndex((h) => h === "ccn" || h === "facility_id");
  const sysIdx = header.findIndex(
    (h) =>
      h === "health_sys_name" ||
      h === "health_system_name" ||
      h === "system_name" ||
      h === "sys_name",
  );
  if (ccnIdx < 0 || sysIdx < 0) {
    console.error(
      `Need ccn + health_sys_name columns. Found: ${header.join(", ")}`,
    );
    process.exit(1);
  }

  const ids = new Set<string>();
  for (const r of rows.slice(1)) {
    const sys = (r[sysIdx] ?? "").trim();
    if (!/HCA/i.test(sys)) continue;
    const raw = (r[ccnIdx] ?? "").trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 5) continue;
    ids.add(digits.padStart(6, "0"));
  }
  for (const id of HCA_NC_FACILITY_IDS) ids.add(String(id));

  const facilityIds = [...ids].sort();
  const payload = {
    source: `AHRQ Compendium Hospital Linkage (${path.basename(abs)}); systems matching /HCA/i; plus NC Mission Health CCNs`,
    asOf: new Date().toISOString().slice(0, 10),
    facilityIds,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_SEED), { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(OUT, body);
  fs.writeFileSync(OUT_SEED, body);
  console.log(`Wrote ${facilityIds.length} CCNs → ${OUT}`);
}

main();
