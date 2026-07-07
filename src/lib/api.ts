import type {
  ComparisonResult,
  HospitalSummary,
  HospitalTrend,
  NearbyHospital,
} from "@shared/types";

const REQUEST_TIMEOUT_MS = 15000;
const WARMING_UP_MESSAGE =
  "The server is waking up or briefly restarting. Please try again in a moment.";

async function fetchOnce(path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(path, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Thrown for real HTTP error responses (4xx/5xx other than warm-up 503s) so
// callers surface the server's message and we do not pointlessly retry.
class HttpError extends Error {}

async function apiGet<T>(path: string): Promise<T> {
  let warmingUpMessage = WARMING_UP_MESSAGE;
  // Retry once: cold starts and mid-deploy restarts on the host briefly
  // refuse/reset connections (surfacing as a raw browser "NetworkError") or
  // return a 503 while the cache warms up. A single retry smooths that over.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchOnce(path);
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        warmingUpMessage = body.error ?? WARMING_UP_MESSAGE;
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new HttpError(body.error ?? `Request failed (${res.status})`);
      } else {
        return (await res.json()) as T;
      }
    } catch (err) {
      // Genuine HTTP errors should not be retried or masked.
      if (err instanceof HttpError) throw err;
      // fetch() rejected (network error / abort) with no HTTP response — the
      // raw browser message is "NetworkError…"; treat it as a transient warm-up.
      warmingUpMessage = WARMING_UP_MESSAGE;
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  throw new Error(warmingUpMessage);
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
