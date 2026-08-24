import fs from "fs";
import {
  gradeToNumeric,
  LEAPFROG_MEASURE_ID,
  type LeapfrogFacilityGrade,
  type LeapfrogGradesFile,
  type LeapfrogLetterGrade,
} from "../shared/leapfrog.js";
import type { HospitalSummary } from "../shared/types.js";
import { LEAPFROG_GRADES_FILE, LEAPFROG_GRADES_SEED } from "./dataPaths.js";

interface ScoreRowRef {
  measureId: string;
}

function resolveLeapfrogGradesPath(): string | null {
  if (fs.existsSync(LEAPFROG_GRADES_FILE)) return LEAPFROG_GRADES_FILE;
  if (fs.existsSync(LEAPFROG_GRADES_SEED)) return LEAPFROG_GRADES_SEED;
  return null;
}

export function loadLeapfrogGradesFile(): LeapfrogGradesFile | null {
  const gradesPath = resolveLeapfrogGradesPath();
  if (!gradesPath) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(gradesPath, "utf8")) as LeapfrogGradesFile;
    if (!raw || typeof raw !== "object" || !raw.grades) return null;
    return raw;
  } catch (err) {
    console.warn("[leapfrog] Failed to read grades file:", err);
    return null;
  }
}

function clearLeapfrogFromMaps(
  scoresByFacility: Map<string, ScoreRowRef[]>,
  scoresByPeer: Map<string, Map<string, { sum: number; count: number }>>,
  nationalBenchmarks: Map<string, number>,
  nationalCounts: Map<string, number>,
) {
  for (const [facilityId, rows] of scoresByFacility) {
    const filtered = rows.filter((r) => r.measureId !== LEAPFROG_MEASURE_ID);
    if (filtered.length !== rows.length) {
      scoresByFacility.set(facilityId, filtered);
    }
  }
  for (const peerMap of scoresByPeer.values()) {
    peerMap.delete(LEAPFROG_MEASURE_ID);
  }
  nationalBenchmarks.delete(LEAPFROG_MEASURE_ID);
  nationalCounts.delete(LEAPFROG_MEASURE_ID);
}

export function applyLeapfrogGrades(
  hospitals: HospitalSummary[],
  scoresByFacility: Map<string, ScoreRowRef[]>,
  scoresByPeer: Map<string, Map<string, { sum: number; count: number }>>,
  nationalBenchmarks: Map<string, number>,
  nationalCounts: Map<string, number>,
  indexScore: (
    hospital: HospitalSummary,
    measureId: string,
    value: number,
    periodStart: string,
    periodEnd: string,
  ) => void,
  currentPeriod: { start: string; end: string },
): { applied: number; release: string | null } {
  const file = loadLeapfrogGradesFile();
  if (!file) {
    return { applied: 0, release: null };
  }

  clearLeapfrogFromMaps(scoresByFacility, scoresByPeer, nationalBenchmarks, nationalCounts);

  const hospitalById = new Map(hospitals.map((h) => [h.facilityId, h]));
  let applied = 0;
  const periodStart = currentPeriod.start || file.updatedAt.slice(0, 10);
  const periodEnd = currentPeriod.end || file.updatedAt.slice(0, 10);

  for (const entry of Object.values(file.grades)) {
    const hospital = hospitalById.get(entry.facilityId);
    if (!hospital || entry.status !== "graded" || !entry.grade) continue;
    const numeric = gradeToNumeric(entry.grade as LeapfrogLetterGrade);
    indexScore(hospital, LEAPFROG_MEASURE_ID, numeric, periodStart, periodEnd);
    applied += 1;
  }

  if (applied > 0) {
    console.log(
      `[leapfrog] Applied ${applied} safety grades (${file.release || "unknown release"}) from ${file.source}`,
    );
  }
  return { applied, release: file.release ?? null };
}

export function getLeapfrogGradeForFacility(facilityId: string): LeapfrogFacilityGrade | null {
  const file = loadLeapfrogGradesFile();
  if (!file) return null;
  return file.grades[facilityId] ?? null;
}
