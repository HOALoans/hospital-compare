#!/usr/bin/env node
/**
 * Import Leapfrog Hospital Safety Grades into data/leapfrog-grades.json.
 *
 * Usage:
 *   npm run ingest:leapfrog -- --scrape              # all CMS hospitals (slow)
 *   npm run ingest:leapfrog -- --scrape --state NC   # one state
 *   npm run ingest:leapfrog -- --facility 340002     # single hospital
 *   npm run ingest:leapfrog -- --file path/to.xlsx   # licensed Hopper export
 *
 * Hopper XLSX: use the "Spring2026" (or latest) sheet with CMS_Certification_Number
 * and Hospital Grade columns. Place files in data/leapfrog-source/ or pass --file.
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  isLeapfrogLetterGrade,
  leapfrogProfileUrl,
  normalizeFacilityId,
  type LeapfrogFacilityGrade,
  type LeapfrogGradesFile,
} from "../shared/leapfrog.js";
import { DATA_DIR, LEAPFROG_GRADES_FILE, LEAPFROG_SOURCE_DIR } from "../server/dataPaths.js";
import { cmsQueryAll, DATASETS } from "../server/cmsClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const RELEASE = process.env.LEAPFROG_RELEASE ?? "Spring 2026";
const SCRAPE_DELAY_MS = Number(process.env.LEAPFROG_SCRAPE_DELAY_MS ?? 750);
const SCRAPE_CONCURRENCY = Number(process.env.LEAPFROG_SCRAPE_CONCURRENCY ?? 1);
const SCRAPE_MAX_RETRIES = Number(process.env.LEAPFROG_SCRAPE_MAX_RETRIES ?? 4);
/** Abort full scrape if this many consecutive fetches return empty/blocked pages. */
const SCRAPE_ABORT_AFTER_EMPTY = Number(process.env.LEAPFROG_SCRAPE_ABORT_AFTER_EMPTY ?? 25);
/** Minimum graded hospitals required for a full national scrape to succeed. */
const SCRAPE_MIN_GRADED = Number(process.env.LEAPFROG_SCRAPE_MIN_GRADED ?? 500);
const CURL_USER_AGENT =
  "Mozilla/5.0 (compatible; ParigradoHospitalCompare/1.0; +https://parigrado.com)";

function parseArgs(argv: string[]) {
  const opts: {
    scrape: boolean;
    file: string | null;
    facility: string | null;
    state: string | null;
    limit: number | null;
  } = {
    scrape: false,
    file: null,
    facility: null,
    state: null,
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scrape") opts.scrape = true;
    else if (a === "--file") opts.file = argv[++i] ?? null;
    else if (a === "--facility") opts.facility = argv[++i] ?? null;
    else if (a === "--state") opts.state = (argv[++i] ?? "").toUpperCase();
    else if (a === "--limit") opts.limit = Number(argv[++i]);
  }
  return opts;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseGradeFromHtml(html: string): {
  grade: LeapfrogFacilityGrade["grade"];
  status: LeapfrogFacilityGrade["status"];
} {
  if (/grade not assigned|not assigned a grade|Grade Not Assigned/i.test(html)) {
    return { grade: null, status: "not_assigned" };
  }
  const featured = html.match(/gradeWrapper feature-gradeWrapper grade-([a-f])\b/i);
  if (featured) {
    const letter = featured[1].toUpperCase();
    if (isLeapfrogLetterGrade(letter)) return { grade: letter, status: "graded" };
  }
  const fallback = html.match(/class="gradeWrapper grade-([a-f])\b/i);
  if (fallback) {
    const letter = fallback[1].toUpperCase();
    if (isLeapfrogLetterGrade(letter)) return { grade: letter, status: "graded" };
  }
  if (/This Hospital.s Grade/i.test(html) && /Spring 2026|Fall 2025/i.test(html)) {
    return { grade: null, status: "not_assigned" };
  }
  if (/Hospital Details<\/title>/i.test(html) && !/feature-gradeWrapper/i.test(html)) {
    return { grade: null, status: "not_found" };
  }
  return { grade: null, status: "not_found" };
}

function fetchHospitalPage(url: string): string | null {
  const result = spawnSync(
    "curl",
    [
      "-sL",
      "--max-time",
      "45",
      "-A",
      CURL_USER_AGENT,
      "-H",
      "Accept: text/html,application/xhtml+xml",
      "-H",
      "Accept-Language: en-US,en;q=0.9",
      url,
    ],
    { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 },
  );
  const html = result.stdout?.trim();
  if (result.status !== 0 || !html) return null;
  // Soft blocks / challenge pages lack hospital grade markup.
  if (!/gradeWrapper|Hospital Details|Hospital Safety Grade/i.test(html)) {
    return null;
  }
  return html;
}

async function fetchHospitalPageWithRetry(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= SCRAPE_MAX_RETRIES; attempt++) {
    const html = fetchHospitalPage(url);
    if (html) return html;
    const backoff = SCRAPE_DELAY_MS * attempt * 2;
    console.warn(
      `[leapfrog] Empty/blocked response for ${url} (attempt ${attempt}/${SCRAPE_MAX_RETRIES}); waiting ${backoff}ms`,
    );
    await sleep(backoff);
  }
  return null;
}

type ScrapeFacilityResult = LeapfrogFacilityGrade & { emptyFetch: boolean };

async function scrapeFacilityGrade(facilityId: string): Promise<ScrapeFacilityResult> {
  const url = leapfrogProfileUrl(facilityId);
  try {
    const html = await fetchHospitalPageWithRetry(url);
    if (!html) {
      return {
        facilityId,
        grade: null,
        score: null,
        status: "not_found",
        release: RELEASE,
        profileUrl: url,
        emptyFetch: true,
      };
    }
    const parsed = parseGradeFromHtml(html);
    return {
      facilityId,
      grade: parsed.grade,
      score: null,
      status: parsed.status,
      release: RELEASE,
      profileUrl: url,
      emptyFetch: false,
    };
  } catch {
    return {
      facilityId,
      grade: null,
      score: null,
      status: "not_found",
      release: RELEASE,
      profileUrl: url,
      emptyFetch: true,
    };
  }
}

class ScrapeBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeBlockedError";
  }
}

async function scrapeFacilities(
  facilityIds: string[],
  onProgress?: (grades: Record<string, LeapfrogFacilityGrade>, done: number, total: number) => void,
): Promise<Record<string, LeapfrogFacilityGrade>> {
  const grades: Record<string, LeapfrogFacilityGrade> = {};
  let index = 0;
  let done = 0;
  let consecutiveEmpty = 0;
  let aborted = false;
  const total = facilityIds.length;

  async function worker() {
    while (!aborted && index < facilityIds.length) {
      const i = index++;
      const facilityId = facilityIds[i];
      const result = await scrapeFacilityGrade(facilityId);
      const { emptyFetch, ...grade } = result;
      grades[facilityId] = grade;
      if (emptyFetch) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= SCRAPE_ABORT_AFTER_EMPTY) {
          aborted = true;
          throw new ScrapeBlockedError(
            `Aborting after ${consecutiveEmpty} consecutive empty/blocked fetches (likely rate-limited by hospitalsafetygrade.org)`,
          );
        }
      } else {
        consecutiveEmpty = 0;
      }
      done += 1;
      if (done % 50 === 0 || done === total) {
        const graded = Object.values(grades).filter((g) => g.status === "graded").length;
        console.log(`[leapfrog] Scraped ${done}/${total}… (${graded} graded)`);
        onProgress?.(grades, done, total);
      }
      await sleep(SCRAPE_DELAY_MS);
    }
  }

  const workers = Array.from({ length: Math.min(SCRAPE_CONCURRENCY, facilityIds.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return grades;
}

async function loadFacilityIdsFromCms(state?: string | null): Promise<string[]> {
  interface Row extends Record<string, string> {
    facility_id: string;
    state: string;
  }
  const rows = await cmsQueryAll<Row>({ dataset: DATASETS.hospitals });
  return rows
    .filter((r) => !state || r.state === state)
    .map((r) => normalizeFacilityId(r.facility_id))
    .filter(Boolean);
}

async function ingestFromXlsx(filePath: string): Promise<Record<string, LeapfrogFacilityGrade>> {
  const { spawnSync } = await import("child_process");
  const pyScript = path.join(__dirname, "ingestLeapfrog.py");
  const result = spawnSync("python3", [pyScript, filePath], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "XLSX parse failed");
  }
  const parsed = JSON.parse(result.stdout) as Record<string, LeapfrogFacilityGrade>;
  return parsed;
}

function writeGradesFile(
  grades: Record<string, LeapfrogFacilityGrade>,
  source: string,
  merge = false,
) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let merged = grades;
  if (merge && fs.existsSync(LEAPFROG_GRADES_FILE)) {
    try {
      const existing = JSON.parse(
        fs.readFileSync(LEAPFROG_GRADES_FILE, "utf8"),
      ) as LeapfrogGradesFile;
      merged = { ...(existing.grades ?? {}), ...grades };
    } catch {
      merged = grades;
    }
  }
  const payload: LeapfrogGradesFile = {
    updatedAt: new Date().toISOString(),
    release: RELEASE,
    source,
    grades: merged,
  };
  fs.writeFileSync(LEAPFROG_GRADES_FILE, JSON.stringify(payload, null, 2));
  const graded = Object.values(merged).filter((g) => g.status === "graded").length;
  console.log(
    `[leapfrog] Wrote ${Object.keys(merged).length} records (${graded} graded) → ${LEAPFROG_GRADES_FILE}`,
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.file) {
    const grades = await ingestFromXlsx(path.resolve(opts.file));
    writeGradesFile(grades, `Hopper XLSX (${path.basename(opts.file)})`);
    return;
  }

  if (opts.facility) {
    const facilityId = normalizeFacilityId(opts.facility);
    const { emptyFetch: _empty, ...grade } = await scrapeFacilityGrade(facilityId);
    const grades = { [facilityId]: grade };
    writeGradesFile(grades, "hospitalsafetygrade.org (single)", true);
    console.log(grade);
    return;
  }

  if (opts.scrape) {
    let ids = await loadFacilityIdsFromCms(opts.state);
    if (opts.limit && opts.limit > 0) ids = ids.slice(0, opts.limit);
    console.log(`[leapfrog] Scraping ${ids.length} hospitals from hospitalsafetygrade.org…`);
    const merge = Boolean(opts.state);
    let grades: Record<string, LeapfrogFacilityGrade>;
    try {
      grades = await scrapeFacilities(ids, (partial, done, total) => {
        if (done % 200 === 0 || done === total) {
          writeGradesFile(partial, "hospitalsafetygrade.org (in progress)", merge);
        }
      });
    } catch (err) {
      if (err instanceof ScrapeBlockedError) {
        console.error(`[leapfrog] ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    writeGradesFile(grades, "hospitalsafetygrade.org", merge);
    const graded = Object.values(grades).filter((g) => g.status === "graded").length;
    const isPartial = Boolean(opts.state || opts.limit);
    if (!isPartial && graded < SCRAPE_MIN_GRADED) {
      console.error(
        `[leapfrog] Only ${graded} graded hospitals (need ≥ ${SCRAPE_MIN_GRADED}). Refusing to treat this as a successful national scrape.`,
      );
      process.exit(1);
    }
    return;
  }

  if (!fs.existsSync(LEAPFROG_SOURCE_DIR)) {
    fs.mkdirSync(LEAPFROG_SOURCE_DIR, { recursive: true });
  }
  const defaultXlsx = fs
    .readdirSync(LEAPFROG_SOURCE_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.xlsx$/i.test(d.name))
    .map((d) => path.join(LEAPFROG_SOURCE_DIR, d.name))
    .sort()
    .pop();

  if (defaultXlsx) {
    const grades = await ingestFromXlsx(defaultXlsx);
    writeGradesFile(grades, `Hopper XLSX (${path.basename(defaultXlsx)})`);
    return;
  }

  console.error(`Usage:
  npm run ingest:leapfrog -- --scrape [--state NC] [--limit N]
  npm run ingest:leapfrog -- --facility 340002
  npm run ingest:leapfrog -- --file /path/to/HospitalSafetyGrade.xlsx

Place licensed Hopper exports in ${LEAPFROG_SOURCE_DIR}/`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
