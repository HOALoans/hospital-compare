/** Leapfrog Hospital Safety Grade helpers (A–F letter grades). */

export const LEAPFROG_MEASURE_ID = "LEAPFROG_SAFETY_GRADE";

export type LeapfrogLetterGrade = "A" | "B" | "C" | "D" | "F";

export type LeapfrogGradeStatus = "graded" | "not_assigned" | "not_found";

export interface LeapfrogFacilityGrade {
  /** CMS facility_id / CCN (6 digits, no dash). */
  facilityId: string;
  /** Letter grade when status is graded. */
  grade: LeapfrogLetterGrade | null;
  /** Numeric score when known (Hopper export). */
  score: number | null;
  status: LeapfrogGradeStatus;
  /** e.g. Spring 2026 */
  release?: string;
  /** hospitalsafetygrade.org profile when known */
  profileUrl?: string;
}

export interface LeapfrogGradesFile {
  updatedAt: string;
  release: string;
  source: string;
  grades: Record<string, LeapfrogFacilityGrade>;
}

const GRADE_NUMERIC: Record<LeapfrogLetterGrade, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};

const NUMERIC_GRADE: Record<number, LeapfrogLetterGrade> = {
  4: "A",
  3: "B",
  2: "C",
  1: "D",
  0: "F",
};

/** Convert CMS CCN (340002) to Leapfrog ID (34-0002). */
export function ccnToLeapfrogId(facilityId: string): string {
  const digits = facilityId.replace(/\D/g, "").padStart(6, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** Normalize Leapfrog / CMS id to 6-digit CCN. */
export function normalizeFacilityId(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(-6).padStart(6, "0");
  return digits.padStart(6, "0");
}

export function leapfrogProfileUrl(facilityId: string): string {
  return `https://www.hospitalsafetygrade.org/h/${ccnToLeapfrogId(facilityId)}`;
}

export function gradeToNumeric(grade: LeapfrogLetterGrade): number {
  return GRADE_NUMERIC[grade];
}

export function numericToGrade(value: number): LeapfrogLetterGrade | null {
  const rounded = Math.round(value);
  return NUMERIC_GRADE[rounded] ?? null;
}

export function formatLeapfrogGrade(value: number | null): string {
  if (value === null) return "Not assigned";
  const letter = numericToGrade(value);
  return letter ?? "—";
}

export function isLeapfrogLetterGrade(raw: string): raw is LeapfrogLetterGrade {
  return raw === "A" || raw === "B" || raw === "C" || raw === "D" || raw === "F";
}
