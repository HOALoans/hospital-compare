export type MeasureGroup =
  | "overall"
  | "communication"
  | "responsiveness"
  | "environment"
  | "discharge"
  | "recommendation"
  | "safety"
  | "readmissions";

export type MeasureValueType = "linear" | "percent" | "star" | "sir";

export type MeasureDataset = "hcahps" | "hai" | "readmissions";

export type MeasureCategory = "patient-experience" | "infections" | "readmissions";

export interface MeasureDefinition {
  id: string;
  label: string;
  group: MeasureGroup;
  category: MeasureCategory;
  valueType: MeasureValueType;
  higherIsBetter: boolean;
  description: string;
  dataset: MeasureDataset;
  /**
   * Value used to filter the CMS dataset when it does not expose a `measure_id`
   * column. The readmissions dataset (9n3s-kdb3) keys rows by `measure_name`
   * (e.g. "READM-30-AMI-HRRP") rather than the internal `id` used elsewhere.
   */
  cmsMeasureName?: string;
}

export const MEASURE_CATEGORIES: { id: MeasureCategory; label: string }[] = [
  { id: "patient-experience", label: "Patient experience (HCAHPS)" },
  { id: "infections", label: "Infections & safety (HAI)" },
  { id: "readmissions", label: "Readmissions" },
];

export const MEASURE_GROUPS: { id: MeasureGroup; label: string }[] = [
  { id: "overall", label: "Overall Experience" },
  { id: "communication", label: "Communication" },
  { id: "responsiveness", label: "Responsiveness & Care" },
  { id: "environment", label: "Hospital Environment" },
  { id: "discharge", label: "Discharge Information" },
  { id: "recommendation", label: "Recommendation" },
  { id: "safety", label: "Infections & Safety (CDC NHSN)" },
  { id: "readmissions", label: "30-Day Readmissions" },
];

export const HCAHPS_MEASURES: MeasureDefinition[] = [
  {
    id: "H_HSP_RATING_LINEAR_SCORE",
    label: "Overall hospital rating",
    group: "overall",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "Linear mean score for overall hospital rating (0–100 scale).",
    dataset: "hcahps",
  },
  {
    id: "H_STAR_RATING",
    label: "HCAHPS summary star rating",
    group: "overall",
    category: "patient-experience",
    valueType: "star",
    higherIsBetter: true,
    description: "Summary star rating derived from HCAHPS composites (1–5 stars).",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_1_LINEAR_SCORE",
    label: "Nurse communication",
    group: "communication",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "How well nurses communicated during the hospital stay.",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_2_LINEAR_SCORE",
    label: "Doctor communication",
    group: "communication",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "How well doctors communicated during the hospital stay.",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_5_LINEAR_SCORE",
    label: "Staff responsiveness",
    group: "responsiveness",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "How quickly staff responded to patient requests.",
    dataset: "hcahps",
  },
  {
    id: "H_QUIET_LINEAR_SCORE",
    label: "Quietness of hospital environment",
    group: "environment",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "How often the area around the room was quiet at night.",
    dataset: "hcahps",
  },
  {
    id: "H_CLEAN_LINEAR_SCORE",
    label: "Cleanliness of hospital environment",
    group: "environment",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "How often the room and bathroom were kept clean.",
    dataset: "hcahps",
  },
  {
    id: "H_COMP_6_LINEAR_SCORE",
    label: "Discharge information",
    group: "discharge",
    category: "patient-experience",
    valueType: "linear",
    higherIsBetter: true,
    description: "Whether patients received information for recovery at home.",
    dataset: "hcahps",
  },
  {
    id: "H_RECMND_LINEAR_SCORE",
    label: "Would recommend hospital",
    group: "recommendation",
    category: "patient-experience",
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
    category: "infections",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for central line associated bloodstream infections.",
    dataset: "hai",
  },
  {
    id: "HAI_2_SIR",
    label: "Catheter urinary tract infections (CAUTI)",
    group: "safety",
    category: "infections",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for catheter-associated urinary tract infections.",
    dataset: "hai",
  },
  {
    id: "HAI_3_SIR",
    label: "Surgical site infections — colon surgery",
    group: "safety",
    category: "infections",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for colon surgery site infections.",
    dataset: "hai",
  },
  {
    id: "HAI_4_SIR",
    label: "Surgical site infections — hysterectomy",
    group: "safety",
    category: "infections",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for hysterectomy site infections.",
    dataset: "hai",
  },
  {
    id: "HAI_5_SIR",
    label: "MRSA bloodstream infections",
    group: "safety",
    category: "infections",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for MRSA bacteremia.",
    dataset: "hai",
  },
  {
    id: "HAI_6_SIR",
    label: "C. difficile infections",
    group: "safety",
    category: "infections",
    valueType: "sir",
    higherIsBetter: false,
    description: "Standardized infection ratio for Clostridioides difficile intestinal infections.",
    dataset: "hai",
  },
];

/** 30-day readmission rates from CMS Hospital Readmissions Reduction Program (lower is better). */
export const READMISSION_MEASURES: MeasureDefinition[] = [
  {
    id: "READM_30_AMI",
    label: "Heart attack (AMI) readmissions",
    group: "readmissions",
    category: "readmissions",
    valueType: "percent",
    higherIsBetter: false,
    description: "Patients readmitted within 30 days of a heart attack discharge.",
    dataset: "readmissions",
    cmsMeasureName: "READM-30-AMI-HRRP",
  },
  {
    id: "READM_30_HF",
    label: "Heart failure readmissions",
    group: "readmissions",
    category: "readmissions",
    valueType: "percent",
    higherIsBetter: false,
    description: "Patients readmitted within 30 days of a heart failure discharge.",
    dataset: "readmissions",
    cmsMeasureName: "READM-30-HF-HRRP",
  },
  {
    id: "READM_30_PN",
    label: "Pneumonia readmissions",
    group: "readmissions",
    category: "readmissions",
    valueType: "percent",
    higherIsBetter: false,
    description: "Patients readmitted within 30 days of a pneumonia discharge.",
    dataset: "readmissions",
    cmsMeasureName: "READM-30-PN-HRRP",
  },
  {
    id: "READM_30_COPD",
    label: "COPD readmissions",
    group: "readmissions",
    category: "readmissions",
    valueType: "percent",
    higherIsBetter: false,
    description: "Patients readmitted within 30 days of a COPD discharge.",
    dataset: "readmissions",
    cmsMeasureName: "READM-30-COPD-HRRP",
  },
  {
    id: "READM_30_HIP_KNEE",
    label: "Hip/knee replacement readmissions",
    group: "readmissions",
    category: "readmissions",
    valueType: "percent",
    higherIsBetter: false,
    description: "Patients readmitted within 30 days of hip/knee replacement.",
    dataset: "readmissions",
    cmsMeasureName: "READM-30-HIP-KNEE-HRRP",
  },
];

export const COMPARISON_MEASURES: MeasureDefinition[] = [
  ...HCAHPS_MEASURES,
  ...HAI_MEASURES,
  ...READMISSION_MEASURES,
];

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
    name: "CMS Hospital Readmissions",
    agency: "CMS",
    description:
      "30-day unplanned readmission rates for common conditions in the Hospital Readmissions Reduction Program.",
    url: "https://data.cms.gov/provider-data/dataset/9n3s-kdb3",
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

export const SITE_NAME = "Parigrado";
export const SITE_TAGLINE =
  "Compare hospital quality to county, state, and national peers using public CMS & CDC data";
