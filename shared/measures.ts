export type MeasureGroup =
  | "overall"
  | "communication"
  | "responsiveness"
  | "environment"
  | "discharge"
  | "recommendation"
  | "safety";

export type MeasureValueType = "linear" | "percent" | "star" | "sir";

export type MeasureDataset = "hcahps" | "hai";

export interface MeasureDefinition {
  id: string;
  label: string;
  group: MeasureGroup;
  valueType: MeasureValueType;
  higherIsBetter: boolean;
  description: string;
  dataset: MeasureDataset;
}

export const MEASURE_GROUPS: { id: MeasureGroup; label: string }[] = [
  { id: "overall", label: "Overall Experience" },
  { id: "communication", label: "Communication" },
  { id: "responsiveness", label: "Responsiveness & Care" },
  { id: "environment", label: "Hospital Environment" },
  { id: "discharge", label: "Discharge Information" },
  { id: "recommendation", label: "Recommendation" },
  { id: "safety", label: "Infections & Safety (CDC NHSN)" },
];

export const HCAHPS_MEASURES: MeasureDefinition[] = [
  {
    id: "H_HSP_RATING_LINEAR_SCORE",
    label: "Overall hospital rating",
    group: "overall",
    valueType: "linear",
    higherIsBetter: true,
    description: "Linear mean score for overall hospital rating (0–100 scale).",
    dataset: "hcahps",
  },
  {
    id: "H_STAR_RATING",
    label: "HCAHPS summary star rating",
    group: "overall",
    valueType: "star",
    higherIsBetter: true,
    description: "Summary star rating derived from HCAHPS composites (1–5 stars).",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_1_LINEAR_SCORE",
    label: "Nurse communication",
    group: "communication",
    valueType: "linear",
    higherIsBetter: true,
    description: "How well nurses communicated during the hospital stay.",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_2_LINEAR_SCORE",
    label: "Doctor communication",
    group: "communication",
    valueType: "linear",
    higherIsBetter: true,
    description: "How well doctors communicated during the hospital stay.",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_5_LINEAR_SCORE",
    label: "Staff responsiveness",
    group: "responsiveness",
    valueType: "linear",
    higherIsBetter: true,
    description: "How quickly staff responded to patient requests.",
    dataset: "hcahps",
  },
  {
    id: "H_QUIET_LINEAR_SCORE",
    label: "Quietness of hospital environment",
    group: "environment",
    valueType: "linear",
    higherIsBetter: true,
    description: "How often the area around the room was quiet at night.",
    dataset: "hcahps",
  },
  {
    id: "H_CLEAN_LINEAR_SCORE",
    label: "Cleanliness of hospital environment",
    group: "environment",
    valueType: "linear",
    higherIsBetter: true,
    description: "How often the room and bathroom were kept clean.",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_6_LINEAR_SCORE",
    label: "Discharge information",
    group: "discharge",
    valueType: "linear",
    higherIsBetter: true,
    description: "Whether patients received information for recovery at home.",
    dataset: "hcahps",
  },
  {
    id: "H_RECMND_LINEAR_SCORE",
    label: "Would recommend hospital",
    group: "recommendation",
    valueType: "linear",
    higherIsBetter: true,
    description: "Likelihood patients would recommend this hospital.",
    dataset: "hcahps",
  },
];

/** CDC NHSN infection data reported through CMS Hospital Compare (SIR — lower is better). */
export const HAI_MEASURES: MeasureDefinition[] = [
  {
    id: "HAI_1_SIR",
    label: "Central line bloodstream infections (CLABSI)",
    group: "safety",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for central line associated bloodstream infections.",
    dataset: "hai",
  },
  {
    id: "HAI_2_SIR",
    label: "Catheter urinary tract infections (CAUTI)",
    group: "safety",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for catheter-associated urinary tract infections.",
    dataset: "hai",
  },
  {
    id: "HAI_3_SIR",
    label: "Surgical site infections — colon surgery",
    group: "safety",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for colon surgery site infections.",
    dataset: "hai",
  },
  {
    id: "HAI_4_SIR",
    label: "Surgical site infections — hysterectomy",
    group: "safety",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for hysterectomy site infections.",
    dataset: "hai",
  },
  {
    id: "HAI_5_SIR",
    label: "MRSA bloodstream infections",
    group: "safety",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for MRSA bacteremia.",
    dataset: "hai",
  },
  {
    id: "HAI_6_SIR",
    label: "C. difficile infections",
    group: "safety",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for Clostridioides difficile intestinal infections.",
    dataset: "hai",
  },
];

export const COMPARISON_MEASURES: MeasureDefinition[] = [...HCAHPS_MEASURES, ...HAI_MEASURES];

export const COMPARISON_MEASURE_IDS = new Set(COMPARISON_MEASURES.map((m) => m.id));

export function getMeasureDefinition(id: string): MeasureDefinition | undefined {
  return COMPARISON_MEASURES.find((m) => m.id === id);
}

export function parseNumericValue(raw: string | undefined | null): number | null {
  if (!raw || raw === "Not Available" || raw === "Not Applicable") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function formatMeasureValue(value: number | null, valueType: MeasureValueType): string {
  if (value === null) return "—";
  if (valueType === "star") return `${value} ★`;
  if (valueType === "percent") return `${value}%`;
  if (valueType === "sir") return value.toFixed(3);
  return String(Math.round(value * 10) / 10);
}

export const DATA_SOURCES = [
  {
    name: "CMS Hospital Compare — HCAHPS",
    agency: "CMS",
    description:
      "Patient experience survey results for Medicare-certified hospitals.",
    url: "https://data.cms.gov/provider-data/dataset/dgck-syfz",
  },
  {
    name: "CMS Healthcare Associated Infections",
    agency: "CMS / CDC NHSN",
    description:
      "Infection measures collected through CDC's National Healthcare Safety Network and reported via CMS.",
    url: "https://data.cms.gov/provider-data/dataset/77hc-ibv8",
  },
  {
    name: "CMS Hospital General Information",
    agency: "CMS",
    description: "Hospital ownership, type, location, and overall quality star rating.",
    url: "https://data.cms.gov/provider-data/dataset/xubh-q36u",
  },
  {
    name: "CMS Hospital Archives",
    agency: "CMS",
    description: "Quarterly archived hospital snapshots (2019–present) for historical trend analysis.",
    url: "https://data.cms.gov/provider-data/archived-data/hospitals",
  },
];

export const ARCHIVE_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export const SITE_NAME = "CareLens Hospital Compare";
export const SITE_TAGLINE = "Compare local hospital quality using public CMS & CDC data";
