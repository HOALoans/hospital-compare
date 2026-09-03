export type HptMetric = "mean" | "median";
export type HptPayer = "cash" | "all";

export const HPT_MAX_CODES = 40;
export const HPT_DEFAULT_VISIBLE = 10;

/** Common shoppable / outpatient HCPCS (CPT is HCPCS Level I). */
export const DEFAULT_HCPCS_CODES = [
  "99213",
  "99214",
  "99283",
  "99284",
  "70450",
  "70553",
  "71046",
  "72148",
  "77067",
  "80053",
  "85025",
  "36415",
  "93000",
  "45378",
  "29881",
  "43239",
  "66984",
  "27447",
  "47562",
  "62323",
];

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
  percentile: number | null;
  top1Percent: boolean;
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
  coverage: HptCoverage;
  rows: HptCodeRow[];
  trends: HptCodeTrend[];
  note: string;
}
