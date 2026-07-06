/**
 * Downloads and extracts CMS hospital archive ZIPs, then builds per-hospital trend files.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { ARCHIVE_YEARS } from "../shared/measures.js";
import { COMPARISON_MEASURE_IDS } from "../shared/measures.js";
import type { HospitalTrend } from "../shared/types.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.join(__dirname, "../.cache/archives");
const RAW_DIR = path.join(__dirname, "../.cache/archives-raw");
const EXTRACT_DIR = path.join(__dirname, "../.cache/archives-extracted");
const LOCK_FILE = path.join(__dirname, "../.cache/archive-ingest.lock");

const CMS_BASE = "https://data.cms.gov";
const CMS_ARCHIVE_CATALOG =
  "https://data.cms.gov/provider-data/api/1/archive/aggregate/theme/hospitals/relative";
const CURRENT_HOSPITAL_ZIP =
  "https://data.cms.gov/provider-data/sites/default/files/archive/Hospitals/current/hospitals_current_data.zip";

type ArchiveSource = {
  id: string;
  year: number;
  label: string;
  urls: string[];
};

type CmsArchiveEntry = {
  name: string;
  type: string;
  url: string;
  date: string;
};

function toAbsoluteCmsUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${CMS_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function loadArchiveSources(): Promise<ArchiveSource[]> {
  const sources: ArchiveSource[] = [
    {
      id: "current",
      year: new Date().getFullYear(),
      label: "Current CMS hospital snapshot",
      urls: [CURRENT_HOSPITAL_ZIP],
    },
  ];

  try {
    const res = await fetch(CMS_ARCHIVE_CATALOG);
    if (!res.ok) {
      console.warn(`[archives] CMS archive catalog returned ${res.status}`);
      return sources;
    }

    const payload = (await res.json()) as { data?: CmsArchiveEntry[] };
    const latestThemeByYear = new Map<string, CmsArchiveEntry>();

    for (const entry of payload.data ?? []) {
      if (entry.type !== "theme") continue;
      const year = entry.date.slice(0, 4);
      const minYear = ARCHIVE_YEARS[0];
      const maxYear = ARCHIVE_YEARS[ARCHIVE_YEARS.length - 1];
      if (Number(year) < minYear || Number(year) > maxYear) continue;

      const existing = latestThemeByYear.get(year);
      if (!existing || entry.date > existing.date) {
        latestThemeByYear.set(year, entry);
      }
    }

    for (const year of [...latestThemeByYear.keys()].sort()) {
      const entry = latestThemeByYear.get(year)!;
      sources.push({
        id: entry.date,
        year: Number(year),
        label: entry.name,
        urls: [toAbsoluteCmsUrl(entry.url)],
      });
    }

    console.log(`[archives] Loaded ${sources.length} archive sources from CMS catalog`);
  } catch (err) {
    console.warn("[archives] Could not fetch CMS archive catalog:", err);
  }

  return sources;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

function findCsvFile(dir: string, pattern: RegExp): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findCsvFile(full, pattern);
      if (nested) return nested;
    } else if (pattern.test(entry.name)) {
      return full;
    }
  }
  return null;
}

function discoverCsvFiles(dir: string): { hcahps: string | null; hai: string | null } {
  let hcahps: string | null =
    findCsvFile(dir, /^HCAHPS-Hospital\.csv$/i) ??
    findCsvFile(dir, /^HCAHPS - Hospital\.csv$/i) ??
    findCsvFile(dir, /hcahps.*hospital/i);
  let hai: string | null =
    findCsvFile(dir, /^Healthcare_Associated_Infections/i) ??
    findCsvFile(dir, /^Healthcare Associated Infections/i) ??
    findCsvFile(dir, /healthcare.*associated.*infection/i);

  if (hcahps && hai) return { hcahps, hai };

  const csvPaths: string[] = [];
  function walk(current: string) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.csv$/i.test(entry.name)) csvPaths.push(full);
    }
  }
  walk(dir);

  for (const csvPath of csvPaths) {
    const headerLine = fs.readFileSync(csvPath, "utf8").split(/\r?\n/)[0] ?? "";
    const headers = parseCsvLine(headerLine).map(normalizeHeader);
    const has = (...names: string[]) => names.every((n) => headers.includes(n));

    if (
      !hcahps &&
      has("facility_id", "hcahps_measure_id") &&
      (headers.includes("hcahps_linear_mean_value") || headers.includes("patient_survey_star_rating"))
    ) {
      hcahps = csvPath;
    }

    if (
      !hai &&
      has("facility_id", "measure_id", "score") &&
      !headers.includes("hcahps_measure_id")
    ) {
      hai = csvPath;
    }
  }

  return { hcahps, hai };
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[/\s]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function parseHcahpsCsv(csvPath: string) {
  const csv = fs.readFileSync(csvPath, "utf8");
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);
  const facilityIdx = idx("facility_id");
  const measureIdx =
    idx("hcahps_measure_id") >= 0 ? idx("hcahps_measure_id") : idx("measure_id");
  const linearIdx = idx("hcahps_linear_mean_value");
  const starIdx = idx("patient_survey_star_rating");
  const haiScoreIdx = idx("score");
  const startIdx = idx("start_date");
  const endIdx = idx("end_date");

  const rows: {
    facilityId: string;
    measureId: string;
    value: number;
    periodStart: string;
    periodEnd: string;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const measureId = cols[measureIdx]?.trim();
    if (!measureId || !COMPARISON_MEASURE_IDS.has(measureId)) continue;

    let value: number | null = null;
    const linear = cols[linearIdx]?.trim();
    const star = cols[starIdx]?.trim();
    const hai = cols[haiScoreIdx]?.trim();
    if (linear && linear !== "Not Applicable" && linear !== "Not Available") value = Number(linear);
    else if (star && star !== "Not Applicable" && star !== "Not Available") value = Number(star);
    else if (hai && hai !== "Not Applicable" && hai !== "Not Available") value = Number(hai);
    if (value === null || !Number.isFinite(value)) continue;

    rows.push({
      facilityId: cols[facilityIdx]?.trim(),
      measureId,
      value,
      periodStart: cols[startIdx]?.trim() ?? "",
      periodEnd: cols[endIdx]?.trim() ?? "",
    });
  }
  return rows;
}

async function tryDownload(urls: string[]): Promise<Buffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* try next */
    }
  }
  return null;
}

async function extractZip(zipPath: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
}

function shouldSkipIngest(): boolean {
  if (process.env.FORCE_INGEST_ARCHIVES === "1") return false;
  if (!fs.existsSync(LOCK_FILE)) return false;
  const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
  return age < 6 * 60 * 60 * 1000;
}

export async function runArchiveIngest() {
  if (shouldSkipIngest()) {
    console.log("[archives] Ingest already ran recently, skipping");
    return;
  }

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, new Date().toISOString());

  const archiveSources = await loadArchiveSources();
  const byFacility = new Map<string, HospitalTrend["points"]>();

  for (const source of archiveSources) {
    const safeId = source.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const zipPath = path.join(RAW_DIR, `hospital_${safeId}.zip`);
    if (!fs.existsSync(zipPath)) {
      console.log(`[archives] Downloading ${source.label}...`);
      const buf = await tryDownload(source.urls);
      if (!buf) {
        console.warn(`[archives]   Could not download ${source.label}`);
        continue;
      }
      fs.writeFileSync(zipPath, buf);
    }

    const extractPath = path.join(EXTRACT_DIR, safeId);
    if (!fs.existsSync(extractPath) || fs.readdirSync(extractPath).length === 0) {
      console.log(`[archives] Extracting ${source.label}...`);
      try {
        await extractZip(zipPath, extractPath);
      } catch (err) {
        console.warn(`[archives]   Extract failed for ${source.label}:`, err);
        continue;
      }
    }

    const { hcahps: hcahpsCsv, hai: haiCsv } = discoverCsvFiles(extractPath);
    const csvFiles = [hcahpsCsv, haiCsv].filter(Boolean) as string[];
    if (csvFiles.length === 0) {
      console.warn(`[archives]   No HCAHPS/HAI CSV found in ${source.label}`);
      continue;
    }

    for (const csvPath of csvFiles) {
      const rows = parseHcahpsCsv(csvPath);
      console.log(`[archives]   ${path.basename(csvPath)}: ${rows.length} score rows`);
      for (const row of rows) {
        const yearFromPeriod = row.periodEnd
          ? Number(row.periodEnd.slice(-4))
          : source.year;
        const year = Number.isFinite(yearFromPeriod) ? yearFromPeriod : source.year;

        const points = byFacility.get(row.facilityId) ?? [];
        let point = points.find((p) => p.year === year);
        if (!point) {
          point = {
            year,
            releaseLabel: source.label,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            scores: {},
          };
          points.push(point);
        } else {
          point.releaseLabel = source.label;
          point.periodStart = row.periodStart;
          point.periodEnd = row.periodEnd;
        }
        point.scores[row.measureId] = row.value;
        byFacility.set(row.facilityId, points);
      }
    }
  }

  for (const [facilityId, points] of byFacility) {
    points.sort((a, b) => a.year - b.year);
    const existingPath = path.join(ARCHIVE_DIR, `${facilityId}.json`);
    let merged = points;
    if (fs.existsSync(existingPath)) {
      const existing = JSON.parse(fs.readFileSync(existingPath, "utf8")) as HospitalTrend;
      const byYear = new Map(existing.points.map((p) => [p.year, p]));
      for (const p of points) byYear.set(p.year, p);
      merged = [...byYear.values()].sort((a, b) => a.year - b.year);
    }
    fs.writeFileSync(
      path.join(ARCHIVE_DIR, `${facilityId}.json`),
      JSON.stringify({ facilityId, points: merged } satisfies HospitalTrend),
    );
  }

  console.log(`[archives] Trend files written for ${byFacility.size} hospitals`);
}

export async function scheduleArchiveIngest() {
  setTimeout(() => {
    runArchiveIngest().catch((err) => console.warn("[archives]", err));
  }, 15_000);
}
