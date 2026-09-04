export type HptMetric = "mean" | "median";
export type HptPayer = "cash" | "all";

export const HPT_MAX_CODES = 40;
export const HPT_DEFAULT_VISIBLE = 40;

/** Common shoppable / outpatient HCPCS (CPT is HCPCS Level I). */
export const DEFAULT_HCPCS_CODES = [
  "99213",
  "99214",
  "99283",
  "99284",
  "99285",
  "70450",
  "70553",
  "71046",
  "71260",
  "72148",
  "73721",
  "77067",
  "80053",
  "85025",
  "36415",
  "93000",
  "93306",
  "45378",
  "29881",
  "43239",
  "66984",
  "27447",
  "47562",
  "62323",
  "20610",
  "97110",
];

/** Short labels for the Pricing page code picker. */
export const HCPCS_CODE_LABELS: Record<string, string> = {
  "99213": "Office visit (est.)",
  "99214": "Office visit (est., longer)",
  "99283": "ED visit",
  "99284": "ED visit (higher)",
  "99285": "ED visit (highest)",
  "70450": "CT head w/o contrast",
  "70553": "MRI brain w/ & w/o",
  "71046": "Chest X-ray 2 views",
  "71260": "CT chest w/ contrast",
  "72148": "MRI lumbar spine",
  "73721": "MRI joint lower extremity",
  "77067": "Screening mammogram",
  "80053": "Metabolic panel",
  "85025": "CBC with differential",
  "36415": "Venipuncture",
  "93000": "ECG",
  "93306": "Echo complete",
  "45378": "Colonoscopy",
  "29881": "Knee arthroscopy",
  "43239": "Upper endoscopy + biopsy",
  "66984": "Cataract surgery",
  "27447": "Total knee arthroplasty",
  "47562": "Laparoscopic cholecystectomy",
  "62323": "Epidural injection",
  "20610": "Joint injection",
  "97110": "Therapeutic exercise",
};

export interface HptChargePoint {
  date: string;
  zip3: string;
  cash: number | null;
  allMean: number | null;
  allMedian: number | null;
  allN: number;
}

export interface HptDistribution {
  n: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p99: number | null;
}

export interface HptHospitalValue {
  facilityId: string;
  name: string;
  value: number | null;
  quartile: 1 | 2 | 3 | 4 | null;
  /** 0–100 empirical percentile among crawled hospitals (higher = more expensive). */
  percentile: number | null;
  /**
   * Where this price sits in the national distribution:
   * low ≤25th, below_median 25–50, above_median 50–75, high ≥75th.
   */
  nationalBand: "low" | "below_median" | "above_median" | "high" | null;
}

export interface HptCodeRow {
  code: string;
  description: string | null;
  hospital: HptHospitalValue;
  compare: HptHospitalValue[];
  national: HptDistribution;
  zip3: HptDistribution;
  zip3Label: string;
}

export interface HptTrendPoint {
  date: string;
  hospital: number | null;
  national: number | null;
  zip3: number | null;
}

export interface HptCodeTrend {
  code: string;
  description: string | null;
  points: HptTrendPoint[];
}

export interface HptCoverage {
  hospitalCount: number;
  crawledOk: number;
  crawledFailed: number;
  pending: number;
  lastCrawlAt: string | null;
  running: boolean;
}

export interface HptCompareResponse {
  hospital: { facilityId: string; name: string; city: string; state: string; zip3: string };
  metric: HptMetric;
  payer: HptPayer;
  snapshotDate: string | null;
  pendingHospital: boolean;
  /** Compare hospitals still downloading their MRFs. */
  pendingCompareIds: string[];
  crawlError?: string | null;
  coverage: HptCoverage;
  rows: HptCodeRow[];
  trends: HptCodeTrend[];
  note: string;
}
