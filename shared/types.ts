import type { OwnershipGroup } from "./ownership.js";
import type { MeasureValueType } from "./measures.js";

export interface HospitalSummary {
  facilityId: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  zip3: string;
  county: string;
  ownership: string;
  ownershipGroup: OwnershipGroup;
  hospitalType: string;
  overallRating: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface NearbyHospital extends HospitalSummary {
  distanceMiles: number | null;
  distanceLabel: string;
}

export interface MeasureScore {
  measureId: string;
  value: number | null;
  valueType: MeasureValueType;
  periodStart: string;
  periodEnd: string;
}

export interface PeerAverage {
  label: string;
  groupKey: string;
  hospitalCount: number;
  scores: Record<string, number | null>;
}

export interface HospitalComparePeer {
  hospital: HospitalSummary;
  groupKey: string;
  scores: Record<string, number | null>;
}

export interface ComparisonResult {
  hospital: HospitalSummary;
  period: { start: string; end: string };
  hospitalScores: MeasureScore[];
  peers: PeerAverage[];
  compareHospitals: HospitalComparePeer[];
  nationalScores: Record<string, number | null>;
  stateScores: Record<string, number | null>;
  countyScores: Record<string, number | null>;
}

export interface TrendPoint {
  year: number;
  releaseLabel: string;
  periodStart: string;
  periodEnd: string;
  scores: Record<string, number | null>;
}

export interface HospitalTrend {
  facilityId: string;
  points: TrendPoint[];
}

export interface SearchResult {
  hospitals: HospitalSummary[];
  query: string;
}
