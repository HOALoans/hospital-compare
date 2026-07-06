import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { HospitalSummary } from "../shared/types.js";
import { classifyOwnership } from "../shared/ownership.js";
import { HCAHPS_MEASURES, HAI_MEASURES } from "../shared/measures.js";
import { cmsQueryAll, DATASETS } from "./cmsClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "../.cache");
const HOSPITALS_FILE = path.join(CACHE_DIR, "hospitals.json");
const SCORES_FILE = path.join(CACHE_DIR, "hcahps-scores.json");

interface CmsHospitalRow extends Record<string, string> {
  facility_id: string;
  facility_name: string;
  citytown: string;
  state: string;
  zip_code: string;
  countyparish: string;
  hospital_type: string;
  hospital_ownership: string;
  hospital_overall_rating: string;
}

interface CmsHcahpsRow extends Record<string, string> {
  facility_id: string;
  state: string;
  hcahps_measure_id: string;
  hcahps_linear_mean_value: string;
  patient_survey_star_rating: string;
  hcahps_answer_percent: string;
  start_date: string;
  end_date: string;
}

interface CmsHaiRow extends Record<string, string> {
  facility_id: string;
  state: string;
  zip_code: string;
  countyparish: string;
  measure_id: string;
  score: string;
  start_date: string;
  end_date: string;
}

export interface CachedScoreRow {
  facilityId: string;
  measureId: string;
  value: number | null;
  periodStart: string;
  periodEnd: string;
}

let hospitals: HospitalSummary[] = [];
let scoresByFacility = new Map<string, CachedScoreRow[]>();
let scoresByPeer = new Map<string, Map<string, { sum: number; count: number }>>();
let nationalBenchmarks = new Map<string, number>();
let nationalCounts = new Map<string, number>();
let currentPeriod = { start: "", end: "" };
let ready = false;

function mapHospital(row: CmsHospitalRow): HospitalSummary {
  const zip3 = row.zip_code?.slice(0, 3) ?? "";
  return {
    facilityId: row.facility_id,
    name: row.facility_name,
    city: row.citytown,
    state: row.state,
    zip: row.zip_code,
    zip3,
    county: row.countyparish,
    ownership: row.hospital_ownership,
    ownershipGroup: classifyOwnership(row.hospital_ownership),
    hospitalType: row.hospital_type,
    overallRating:
      row.hospital_overall_rating &&
      row.hospital_overall_rating !== "Not Available"
        ? row.hospital_overall_rating
        : null,
  };
}

function parseHcahpsScore(row: CmsHcahpsRow): number | null {
  const linear = row.hcahps_linear_mean_value;
  if (linear && linear !== "Not Applicable" && linear !== "Not Available") {
    const n = Number(linear);
    return Number.isFinite(n) ? n : null;
  }
  const star = row.patient_survey_star_rating;
  if (star && star !== "Not Applicable" && star !== "Not Available") {
    const n = Number(star);
    return Number.isFinite(n) ? n : null;
  }
  const pct = row.hcahps_answer_percent;
  if (pct && pct !== "Not Applicable" && pct !== "Not Available") {
    const n = Number(pct);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseHaiScore(row: CmsHaiRow): number | null {
  const score = row.score;
  if (!score || score === "Not Available" || score === "Not Applicable") return null;
  const n = Number(score);
  return Number.isFinite(n) ? n : null;
}

export function peerKeyState(state: string, ownershipGroup: string) {
  return `s:${state}:${ownershipGroup}`;
}

export function peerKeyCounty(state: string, county: string, ownershipGroup: string) {
  return `c:${state}:${county.toUpperCase()}:${ownershipGroup}`;
}

export function peerKeyZip3(zip3: string, ownershipGroup: string) {
  return `z:${zip3}:${ownershipGroup}`;
}

function addPeerScore(key: string, measureId: string, value: number) {
  if (!scoresByPeer.has(key)) scoresByPeer.set(key, new Map());
  const bucket = scoresByPeer.get(key)!;
  const existing = bucket.get(measureId) ?? { sum: 0, count: 0 };
  existing.sum += value;
  existing.count += 1;
  bucket.set(measureId, existing);
}

function addNationalScore(measureId: string, value: number) {
  nationalBenchmarks.set(measureId, (nationalBenchmarks.get(measureId) ?? 0) + value);
  nationalCounts.set(measureId, (nationalCounts.get(measureId) ?? 0) + 1);
}

function finalizeNationalAverages() {
  for (const [measureId, sum] of nationalBenchmarks) {
    const count = nationalCounts.get(measureId) ?? 1;
    nationalBenchmarks.set(measureId, sum / count);
  }
}

function indexScore(
  hospital: HospitalSummary,
  measureId: string,
  value: number,
  periodStart: string,
  periodEnd: string,
) {
  const cached: CachedScoreRow = {
    facilityId: hospital.facilityId,
    measureId,
    value,
    periodStart,
    periodEnd,
  };
  const list = scoresByFacility.get(hospital.facilityId) ?? [];
  list.push(cached);
  scoresByFacility.set(hospital.facilityId, list);

  addNationalScore(measureId, value);

  const og = hospital.ownershipGroup;
  addPeerScore(peerKeyState(hospital.state, "all"), measureId, value);
  addPeerScore(peerKeyState(hospital.state, og), measureId, value);
  addPeerScore(peerKeyCounty(hospital.state, hospital.county, "all"), measureId, value);
  addPeerScore(peerKeyCounty(hospital.state, hospital.county, og), measureId, value);
  if (hospital.zip3) {
    addPeerScore(peerKeyZip3(hospital.zip3, "all"), measureId, value);
    addPeerScore(peerKeyZip3(hospital.zip3, og), measureId, value);
  }
}

export function isCacheReady() {
  return ready;
}

export function getHospitals() {
  return hospitals;
}

export function getCurrentPeriod() {
  return currentPeriod;
}

export function getHospitalById(id: string) {
  return hospitals.find((h) => h.facilityId === id);
}

export function searchHospitals(query: string, state?: string, limit = 25): HospitalSummary[] {
  const q = query.trim().toLowerCase();
  let results = hospitals;
  if (state) results = results.filter((h) => h.state === state);
  if (!q) return results.slice(0, limit);

  const scored = results
    .map((h) => {
      const name = h.name.toLowerCase();
      const city = h.city.toLowerCase();
      const county = h.county.toLowerCase();
      let score = 0;
      if (name === q) score += 100;
      else if (name.startsWith(q)) score += 80;
      else if (name.includes(q)) score += 50;
      if (city.includes(q)) score += 20;
      if (county.includes(q)) score += 15;
      if (h.zip.startsWith(q)) score += 30;
      return { h, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.h);
}

export function getFacilityScores(facilityId: string) {
  return scoresByFacility.get(facilityId) ?? [];
}

export function getPeerAverage(
  peerKey: string,
  measureId: string,
): { value: number | null; count: number } {
  const bucket = scoresByPeer.get(peerKey);
  if (!bucket) return { value: null, count: 0 };
  const entry = bucket.get(measureId);
  if (!entry || entry.count === 0) return { value: null, count: 0 };
  return { value: entry.sum / entry.count, count: entry.count };
}

export function getNationalBenchmark(measureId: string): number | null {
  return nationalBenchmarks.get(measureId) ?? null;
}

export function countHospitalsInPeer(peerKey: string): number {
  if (peerKey.startsWith("s:")) {
    const [, state, og] = peerKey.split(":");
    return hospitals.filter(
      (h) => h.state === state && (og === "all" || h.ownershipGroup === og),
    ).length;
  }
  if (peerKey.startsWith("c:")) {
    const [, state, county, og] = peerKey.split(":");
    return hospitals.filter(
      (h) =>
        h.state === state &&
        h.county.toUpperCase() === county &&
        (og === "all" || h.ownershipGroup === og),
    ).length;
  }
  if (peerKey.startsWith("z:")) {
    const [, zip3, og] = peerKey.split(":");
    return hospitals.filter(
      (h) => h.zip3 === zip3 && (og === "all" || h.ownershipGroup === og),
    ).length;
  }
  return 0;
}

async function loadFromCms() {
  console.log("[cache] Loading hospital directory from CMS...");
  const hospitalRows = await cmsQueryAll<CmsHospitalRow>({ dataset: DATASETS.hospitals });
  hospitals = hospitalRows.map(mapHospital);
  const hospitalById = new Map(hospitals.map((h) => [h.facilityId, h]));

  scoresByFacility = new Map();
  scoresByPeer = new Map();
  nationalBenchmarks = new Map();
  nationalCounts = new Map();

  console.log("[cache] Loading HCAHPS scores...");
  for (const measure of HCAHPS_MEASURES) {
    const rows = await cmsQueryAll<CmsHcahpsRow>({
      dataset: DATASETS.hcahps,
      conditions: [{ property: "hcahps_measure_id", value: measure.id }],
    });
    for (const row of rows) {
      const value = parseHcahpsScore(row);
      if (value === null) continue;
      if (!currentPeriod.start) currentPeriod = { start: row.start_date, end: row.end_date };
      const hospital = hospitalById.get(row.facility_id);
      if (!hospital) continue;
      indexScore(hospital, measure.id, value, row.start_date, row.end_date);
    }
    console.log(`[cache]   HCAHPS ${measure.id}: ${rows.length} rows`);
  }

  console.log("[cache] Loading HAI infection scores (CDC NHSN via CMS)...");
  for (const measure of HAI_MEASURES) {
    const rows = await cmsQueryAll<CmsHaiRow>({
      dataset: DATASETS.hai,
      conditions: [{ property: "measure_id", value: measure.id }],
    });
    for (const row of rows) {
      const value = parseHaiScore(row);
      if (value === null) continue;
      const hospital = hospitalById.get(row.facility_id);
      if (!hospital) continue;
      indexScore(hospital, measure.id, value, row.start_date, row.end_date);
    }
    console.log(`[cache]   HAI ${measure.id}: ${rows.length} rows`);
  }

  finalizeNationalAverages();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(HOSPITALS_FILE, JSON.stringify({ hospitals, currentPeriod }));
  fs.writeFileSync(
    SCORES_FILE,
    JSON.stringify({
      currentPeriod,
      scores: [...scoresByFacility.entries()],
      peers: [...scoresByPeer.entries()].map(([key, map]) => [key, [...map.entries()]]),
      national: [...nationalBenchmarks.entries()],
      nationalCounts: [...nationalCounts.entries()],
    }),
  );
}

function loadFromDisk() {
  if (!fs.existsSync(HOSPITALS_FILE) || !fs.existsSync(SCORES_FILE)) return false;
  const hospitalData = JSON.parse(fs.readFileSync(HOSPITALS_FILE, "utf8"));
  const scoreData = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
  hospitals = hospitalData.hospitals;
  currentPeriod = hospitalData.currentPeriod ?? scoreData.currentPeriod ?? { start: "", end: "" };
  scoresByFacility = new Map(scoreData.scores);
  scoresByPeer = new Map(
    scoreData.peers.map(([key, entries]: [string, [string, { sum: number; count: number }][]]) => [
      key,
      new Map(entries),
    ]),
  );
  nationalBenchmarks = new Map(scoreData.national);
  nationalCounts = new Map(scoreData.nationalCounts ?? []);
  return true;
}

export async function initializeCache(maxAgeHours = 24) {
  const hospitalsMtime = fs.existsSync(HOSPITALS_FILE) ? fs.statSync(HOSPITALS_FILE).mtimeMs : 0;
  const ageHours = (Date.now() - hospitalsMtime) / (1000 * 60 * 60);
  const freshEnough = ageHours < maxAgeHours;

  if (freshEnough && loadFromDisk()) {
    console.log(`[cache] Loaded ${hospitals.length} hospitals from disk cache`);
    ready = true;
    return;
  }

  await loadFromCms();
  ready = true;
  console.log(`[cache] Ready — ${hospitals.length} hospitals indexed`);
}
