import type {
  ComparisonResult,
  HospitalSummary,
  HospitalTrend,
  NearbyHospital,
} from "@shared/types";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function searchHospitals(q: string, state?: string) {
  const params = new URLSearchParams({ q });
  if (state) params.set("state", state);
  return apiGet<{ hospitals: HospitalSummary[]; query: string }>(
    `/api/hospitals/search?${params}`,
  );
}

export function fetchHospital(facilityId: string) {
  return apiGet<HospitalSummary>(`/api/hospitals/${facilityId}`);
}

export function fetchNearbyHospitals(facilityId: string) {
  return apiGet<{ hospital: HospitalSummary; nearby: NearbyHospital[] }>(
    `/api/hospitals/${facilityId}/nearby`,
  );
}

export function fetchComparison(facilityId: string, compareWithIds: string[] = []) {
  const params = new URLSearchParams();
  if (compareWithIds.length > 0) {
    params.set("compareWith", compareWithIds.join(","));
  }
  const qs = params.toString();
  return apiGet<ComparisonResult>(
    `/api/hospitals/${facilityId}/compare${qs ? `?${qs}` : ""}`,
  );
}

export function fetchTrends(facilityId: string) {
  return apiGet<HospitalTrend & { message?: string; availableYears?: number[] }>(
    `/api/hospitals/${facilityId}/trends`,
  );
}

export function fetchHealth() {
  return apiGet<{
    ok: boolean;
    ready: boolean;
    directoryReady?: boolean;
    hospitalCount: number;
    reportingPeriod?: { start: string; end: string };
    lastCacheRefresh?: string | null;
  }>("/api/health");
}

export function fetchArchiveMeta() {
  return apiGet<{
    ingestedHospitalCount: number;
    totalHospitalCount: number;
    estimatedYearProgress: number;
    estimatedYearsTotal: number;
    lastCacheRefresh?: string | null;
    reportingPeriod?: { start: string; end: string };
  }>("/api/meta/archives");
}
