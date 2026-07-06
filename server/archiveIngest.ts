/**
 * Downloads and extracts CMS hospital archive ZIPs, then builds per-hospital trend files.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { COMPARISON_MEASURE_IDS } from "../shared/measures.js";
import type { HospitalTrend } from "../shared/types.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.join(__dirname, "../.cache/archives");
const RAW_DIR = path.join(__dirname, "../.cache/archives-raw");
const EXTRACT_DIR = path.join(__dirname, "../.cache/archives-extracted");
const LOCK_FILE = path.join(__dirname, "../.cache/archive-ingest.lock");

const ARCHIVE_SOURCES: { year: number; label: string; urls: string[] }[] = [
  {
    year: 2024,
    label: "2024 archive",
    urls: [
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2024/hospital_12_2024.zip",
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2024/Hospital_2024_archive.zip",
    ],
  },
  {
    year: 2023,
    label: "2023 archive",
    urls: [
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2023/hospital_12_2023.zip",
    ],
  },
  {
    year: 2022,
    label: "2022 archive",
    urls: [
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2022/hospital_12_2022.zip",
    ],
  },
  {
    year: 2021,
    label: "2021 archive",
    urls: [
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2021/hospital_12_2021.zip",
    ],
  },
  {
    year: 2020,
    label: "2020 archive",
    urls: [
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2020/hospital_12_2020.zip",
    ],
  },
  {
    year: 2019,
    label: "2019 archive",
    urls: [
      "https://data.cms.gov/provider-data/sites/default/files/archive/Hospital/2019/hospital_12_2019.zip",
    ],
  },
];

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

function parseHcahpsCsv(csvPath: string) {
  const csv = fs.readFileSync(csvPath, "utf8");
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const facilityIdx = idx("facility_id");
  const measureIdx = idx("hcahps_measure_id") >= 0 ? idx("hcahps_measure_id") : idx("measure_id");
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

export async function runArchiveIngest() {
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < 6 * 60 * 60 * 1000) {
      console.log("[archives] Ingest already ran recently, skipping");
      return;
    }
  }
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, new Date().toISOString());

  const byFacility = new Map<string, HospitalTrend["points"]>();

  for (const source of ARCHIVE_SOURCES) {
    const zipPath = path.join(RAW_DIR, `hospital_${source.year}.zip`);
    if (!fs.existsSync(zipPath)) {
      console.log(`[archives] Downloading ${source.label}...`);
      const buf = await tryDownload(source.urls);
      if (!buf) {
        console.warn(`[archives]   Could not download ${source.label}`);
        continue;
      }
      fs.writeFileSync(zipPath, buf);
    }

    const extractPath = path.join(EXTRACT_DIR, String(source.year));
    if (!fs.existsSync(extractPath) || fs.readdirSync(extractPath).length === 0) {
      console.log(`[archives] Extracting ${source.label}...`);
      try {
        await extractZip(zipPath, extractPath);
      } catch (err) {
        console.warn(`[archives]   Extract failed for ${source.label}:`, err);
        continue;
      }
    }

    const hcahpsCsv =
      findCsvFile(extractPath, /hcahps.*hospital/i) ??
      findCsvFile(extractPath, /HCAHPS/i);
    const haiCsv = findCsvFile(extractPath, /healthcare.*associated.*infection/i);

    const csvFiles = [hcahpsCsv, haiCsv].filter(Boolean) as string[];
    if (csvFiles.length === 0) {
      console.warn(`[archives]   No HCAHPS/HAI CSV found in ${source.label}`);
      continue;
    }

    for (const csvPath of csvFiles) {
      const rows = parseHcahpsCsv(csvPath);
      console.log(`[archives]   ${path.basename(csvPath)}: ${rows.length} score rows`);
      for (const row of rows) {
        const points = byFacility.get(row.facilityId) ?? [];
        let point = points.find((p) => p.year === source.year);
        if (!point) {
          point = {
            year: source.year,
            releaseLabel: source.label,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            scores: {},
          };
          points.push(point);
        }
        point.scores[row.measureId] = row.value;
        byFacility.set(row.facilityId, points);
      }
    }
  }

  for (const [facilityId, points] of byFacility) {
    points.sort((a, b) => a.year - b.year);
    fs.writeFileSync(
      path.join(ARCHIVE_DIR, `${facilityId}.json`),
      JSON.stringify({ facilityId, points } satisfies HospitalTrend),
    );
  }

  console.log(`[archives] Trend files written for ${byFacility.size} hospitals`);
}

export async function scheduleArchiveIngest() {
  setTimeout(() => {
    runArchiveIngest().catch((err) => console.warn("[archives]", err));
  }, 15_000);
}
