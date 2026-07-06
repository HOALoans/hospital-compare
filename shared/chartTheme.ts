/** Parigrado chart palette — high contrast, color-blind friendly bases */
export const CHART = {
  baseHospital: "#c2410c",
  baseHospitalLight: "#fed7aa",
  national: "#475569",
  state: "#2563eb",
  county: "#7c3aed",
  peerGroup: "#d97706",
  trackLow: "#fecaca",
  trackMid: "#fef3c7",
  trackHigh: "#bbf7d0",
  positive: "#15803d",
  negative: "#b91c1c",
} as const;

export const INDIVIDUAL_HOSPITAL_COLORS = [
  "#0891b2",
  "#db2777",
  "#059669",
  "#9333ea",
  "#ca8a04",
  "#0284c7",
  "#be123c",
  "#4d7c0f",
  "#6366f1",
  "#0d9488",
] as const;

export function individualHospitalColor(index: number): string {
  return INDIVIDUAL_HOSPITAL_COLORS[index % INDIVIDUAL_HOSPITAL_COLORS.length];
}
