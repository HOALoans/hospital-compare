/**
 * Downloads and extracts CMS hospital archive ZIPs, then builds per-hospital trend files.
 */
import fs from "fs";
import readline from "readline";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { ARCHIVE_YEARS } from "../shared/measures.js";
import { COMPARISON_MEASURE_IDS } from "../shared/measures.js";
import type { HospitalTrend } from "../shared/types.js";
import {
  ARCHIVE_DIR,
  ARCHIVE_EXTRACT_DIR,
  ARCHIVE_LOCK_FILE,
  ARCHIVE_RAW_DIR,
} from "./dataPaths.js";

const execFileAsync = promisify(execFile);
const RAW_DIR = ARCHIVE_RAW_DIR;
const EXTRACT_DIR = ARCHIVE_EXTRACT_DIR;
const LOCK_FILE = ARCHIVE_LOCK_FILE;
/** Bump when ingest year-keying or merge rules change so redeploys rebuild trends. */
const INGEST_VERSION = 3;

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

/**
 * Reads only the first line of a (potentially very large) file by streaming,
 * so we never load a 150MB+ CSV into memory just to inspect its header.
 */
async function readFirstLine(filePath: string): Promise<string> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      return line;
    }
    return "";
  } finally {
    rl.close();
    stream.destroy();
  }
}

async function discoverCsvFiles(
  dir: string,
): Promise<{ hcahps: string | null; hai: string | null }> {
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
    const headerLine = await readFirstLine(csvPath);
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

interface ArchiveScoreRow {
  facilityId: string;
  measureId: string;
  value: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Streams a CMS score CSV line-by-line (readline over a read stream) and invokes
 * `onRow` for each matching measure. Only a single line is ever held in memory,
 * so even a 150MB+ HCAHPS CSV parses within the 512MB free-tier budget instead
 * of blowing up the heap via readFileSync + String.split.
 */
async function streamScoreCsv(
  csvPath: string,
  onRow: (row: ArchiveScoreRow) => void,
): Promise<number> {
  const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] | null = null;
  let facilityIdx = -1;
  let measureIdx = -1;
  let linearIdx = -1;
  let starIdx = -1;
  let haiScoreIdx = -1;
  let startIdx = -1;
  let endIdx = -1;
  let matched = 0;

  try {
    for await (const line of rl) {
      if (!line) continue;

      if (headers === null) {
        headers = parseCsvLine(line).map(normalizeHeader);
        const idx = (name: string) => headers!.indexOf(name);
        facilityIdx = idx("facility_id");
        measureIdx = idx("hcahps_measure_id") >= 0 ? idx("hcahps_measure_id") : idx("measure_id");
        linearIdx = idx("hcahps_linear_mean_value");
        starIdx = idx("patient_survey_star_rating");
        haiScoreIdx = idx("score");
        startIdx = idx("start_date");
        endIdx = idx("end_date");
        continue;
      }

      const cols = parseCsvLine(line);
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

      onRow({
        facilityId: cols[facilityIdx]?.trim(),
        measureId,
        value,
        periodStart: cols[startIdx]?.trim() ?? "",
        periodEnd: cols[endIdx]?.trim() ?? "",
      });
      matched += 1;
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return matched;
}

/**
 * Streams the first reachable URL straight to `destPath` so the compressed
 * archive is never fully buffered in the JS heap. Returns true on success.
 */
async function tryDownloadToFile(urls: string[], destPath: string): Promise<boolean> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) continue;
      const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
      await pipeline(nodeStream, fs.createWriteStream(destPath));
      return true;
    } catch {
      fs.rmSync(destPath, { force: true });
    }
  }
  return false;
}

async function extractZip(zipPath: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
}

function flushTrendFiles(byFacility: Map<string, HospitalTrend["points"]>) {
  const allowedYears = new Set(ARCHIVE_YEARS);
  // Current snapshot may use the calendar year outside ARCHIVE_YEARS
  allowedYears.add(new Date().getFullYear());

  for (const [facilityId, points] of byFacility) {
    points.sort((a, b) => a.year - b.year);
    const existingPath = path.join(ARCHIVE_DIR, `${facilityId}.json`);
    let merged = points;
    if (fs.existsSync(existingPath)) {
      const existing = JSON.parse(fs.readFileSync(existingPath, "utf8")) as HospitalTrend;
      const byYear = new Map(
        existing.points.filter((p) => allowedYears.has(p.year)).map((p) => [p.year, p]),
      );
      for (const p of points) byYear.set(p.year, p);
      merged = [...byYear.values()].sort((a, b) => a.year - b.year);
    }
    fs.writeFileSync(
      path.join(ARCHIVE_DIR, `${facilityId}.json`),
      JSON.stringify({ facilityId, points: merged } satisfies HospitalTrend),
    );
  }
}

/**
 * Skip re-ingest when the lock is fresh (<6h) and trend files already exist on
 * the persistent data disk. First deploy after this change starts with an empty
 * disk and runs a full ingest once; later redeploys reuse stored archives.
 */
function shouldSkipIngest(): boolean {
  if (process.env.FORCE_INGEST_ARCHIVES === "1") return false;
  if (!fs.existsSync(LOCK_FILE)) return false;
  const lockBody = fs.readFileSync(LOCK_FILE, "utf8");
  if (!lockBody.includes(`version=${INGEST_VERSION}`)) return false;
  const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
  if (age >= 6 * 60 * 60 * 1000) return false;
  if (!fs.existsSync(ARCHIVE_DIR)) return false;
  const hasTrendFiles = fs.readdirSync(ARCHIVE_DIR).some((f) => f.endsWith(".json"));
  return hasTrendFiles;
}

export async function runArchiveIngest() {
  if (shouldSkipIngest()) {
    console.log("[archives] Ingest already ran recently, skipping");
    return;
  }

  const lockNeedsRebuild =
    !fs.existsSync(LOCK_FILE) ||
    !fs.readFileSync(LOCK_FILE, "utf8").includes(`version=${INGEST_VERSION}`);

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(EXTRACT_DIR, { recursive: true });

  // Do not wipe trend files on version bump — a mid-ingest crash would leave only
  // the latest snapshot year (e.g. 2026). flushTrendFiles drops disallowed years
  // (like old period-end 2018) while merging snapshot years as they complete.
  if (lockNeedsRebuild) {
    console.log("[archives] Ingest version rebuild — merging into existing trend files");
  }

  // Remove stale lock until ingest finishes so a crash mid-run does not skip rebuild.
  fs.rmSync(LOCK_FILE, { force: true });

  const archiveSources = await loadArchiveSources();

  // Process one archive source at a time. The per-source map is scoped to the
  // loop body and flushed (merged into the on-disk trend files) before the next
  // source is fetched, so we never hold 8 years of rows in memory simultaneously.
  for (const source of archiveSources) {
    const safeId = source.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const zipPath = path.join(RAW_DIR, `hospital_${safeId}.zip`);
    if (!fs.existsSync(zipPath)) {
      console.log(`[archives] Downloading ${source.label}...`);
      const ok = await tryDownloadToFile(source.urls, zipPath);
      if (!ok) {
        console.warn(`[archives]   Could not download ${source.label}`);
        continue;
      }
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

    const { hcahps: hcahpsCsv, hai: haiCsv } = await discoverCsvFiles(extractPath);
    const csvFiles = [hcahpsCsv, haiCsv].filter(Boolean) as string[];
    if (csvFiles.length === 0) {
      console.warn(`[archives]   No HCAHPS/HAI CSV found in ${source.label}`);
      continue;
    }

    const byFacility = new Map<string, HospitalTrend["points"]>();

    for (const csvPath of csvFiles) {
      const matched = await streamScoreCsv(csvPath, (row) => {
        // Key by CMS archive snapshot year (not HCAHPS period-end year).
        // Period-end years collapse multiple archives onto the same point and
        // skip snapshot years (e.g. 2023/2024), which made the chart look empty.
        const year = source.year;

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
      });
      console.log(`[archives]   ${path.basename(csvPath)}: ${matched} score rows`);
    }

    flushTrendFiles(byFacility);
    console.log(`[archives]   Saved trends for ${byFacility.size} hospitals after ${source.label}`);
    // Drop this source's rows before moving to the next archive so peak heap
    // stays flat instead of growing across all years.
    byFacility.clear();
  }

  fs.writeFileSync(LOCK_FILE, `version=${INGEST_VERSION}\n${new Date().toISOString()}`);
  console.log(`[archives] Trend ingest complete across ${archiveSources.length} sources`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Defers the heavy archive ingest until the primary score cache is ready, so
 * the streaming CSV parse never competes with the initial CMS load for the
 * 512MB heap. `isReady` is polled with backoff up to `maxWaitMs`.
 */
export async function scheduleArchiveIngest(
  isReady: () => boolean = () => true,
  { initialDelayMs = 15_000, pollMs = 5_000, maxWaitMs = 15 * 60 * 1000 } = {},
) {
  await sleep(initialDelayMs);

  const startedAt = Date.now();
  while (!isReady() && Date.now() - startedAt < maxWaitMs) {
    await sleep(pollMs);
  }

  if (!isReady()) {
    console.warn("[archives] Scores not ready in time; running ingest anyway");
  }

  await runArchiveIngest();
}
