import type { HospitalSummary } from "../../shared/types.js";
import { DEFAULT_HCPCS_CODES } from "../../shared/hpt.js";
import { getHospitals, getHospitalById, isHospitalDirectoryReady } from "../cache.js";
import { discoverMrfUrl } from "./discover.js";
import { parseMrfUrl } from "./parseMrf.js";
import {
  getCoverage,
  hospitalHasSnapshot,
  loadStatus,
  markRunning,
  saveStatus,
  upsertHospitalCharges,
  upsertHospitalMeta,
} from "./store.js";

const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const BETWEEN_HOSPITAL_MS = Number(process.env.HPT_BETWEEN_MS ?? 2_500);
/** Abort a single hospital crawl if the MRF stream takes longer than this. */
const CRAWL_TIMEOUT_MS = Number(process.env.HPT_CRAWL_TIMEOUT_MS ?? 3 * 60 * 1000);

let queue: string[] = [];
let looping = false;
const inFlight = new Set<string>();
const priority = new Set<string>();
/** Optional HCPCS filters requested by the Pricing page (keeps huge MRFs tractable). */
const codeFilters = new Map<string, Set<string>>();

function isStale(facilityId: string): boolean {
  const rec = loadStatus().hospitals[facilityId];
  if (!rec?.lastOkAt) return true;
  return Date.now() - Date.parse(rec.lastOkAt) > STALE_MS;
}

function seedNationalQueue(preferred: string[] = []) {
  if (!isHospitalDirectoryReady()) return;
  const hospitals = getHospitals();
  const st = loadStatus();
  for (const h of hospitals) {
    if (!st.hospitals[h.facilityId]) {
      st.hospitals[h.facilityId] = {
        facilityId: h.facilityId,
        zip3: h.zip3,
        name: h.name,
        status: "pending",
        lastAttemptAt: null,
        lastOkAt: null,
        snapshots: [],
      };
    }
  }
  saveStatus();

  const byNeed = hospitals
    .slice()
    .sort((a, b) => {
      const ra = st.hospitals[a.facilityId];
      const rb = st.hospitals[b.facilityId];
      const sa = ra?.status === "ok" && !isStale(a.facilityId) ? 2 : ra?.status === "failed" ? 1 : 0;
      const sb = rb?.status === "ok" && !isStale(b.facilityId) ? 2 : rb?.status === "failed" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.state.localeCompare(b.state) || a.name.localeCompare(b.name);
    })
    .map((h) => h.facilityId);

  const pref = preferred.filter((id) => hospitals.some((h) => h.facilityId === id));
  queue = [...new Set([...pref, ...byNeed])];
}

export function prioritizeHospitals(ids: string[], codes?: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  for (const id of unique) {
    priority.add(id);
    if (codes?.length) {
      // Only the codes the UI asked for. Merging every DEFAULT code forced a full
      // ~800MB scan whenever one code (e.g. 93000) was absent from the MRF.
      const set = codeFilters.get(id) ?? new Set<string>();
      for (const c of codes) {
        const n = c.trim().toUpperCase();
        if (n) set.add(n);
      }
      codeFilters.set(id, set);
    }
  }
  void crawlLoop();
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(ctrl.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function crawlOne(facilityId: string): Promise<void> {
  const hospital = getHospitalById(facilityId);
  if (!hospital) return;
  const rec = loadStatus().hospitals[facilityId];
  upsertHospitalMeta({
    facilityId,
    zip3: hospital.zip3,
    name: hospital.name,
    status: rec?.status === "ok" ? "ok" : "pending",
    lastAttemptAt: new Date().toISOString(),
    lastOkAt: rec?.lastOkAt ?? null,
    snapshots: rec?.snapshots ?? [],
    mrfUrl: rec?.mrfUrl,
  });

  const found = await discoverMrfUrl(hospital);
  if (!found) {
    upsertHospitalMeta({
      facilityId,
      zip3: hospital.zip3,
      name: hospital.name,
      status: "failed",
      lastAttemptAt: new Date().toISOString(),
      lastOkAt: rec?.lastOkAt ?? null,
      snapshots: rec?.snapshots ?? [],
      error: "Could not find cms-hpt.txt / MRF URL",
    });
    return;
  }

  const filter = codeFilters.get(facilityId) ?? new Set(DEFAULT_HCPCS_CODES);
  console.log(`[hpt] Parsing ${facilityId} (${filter.size} HCPCS filter) ${found.mrfUrl.slice(0, 80)}…`);
  const parsed = await withTimeout(
    (signal) => parseMrfUrl(found.mrfUrl, { codeFilter: filter, signal }),
    CRAWL_TIMEOUT_MS,
    `MRF parse for ${facilityId}`,
  );
  await new Promise((r) => setImmediate(r));
  const date = new Date().toISOString().slice(0, 10);
  await upsertHospitalCharges({
    facilityId,
    zip3: hospital.zip3,
    date,
    mrfUrl: found.mrfUrl,
    codes: parsed.codes,
  });
  codeFilters.delete(facilityId);
  console.log(
    `[hpt] ${hospital.facilityId} ${hospital.name}: ${Object.keys(parsed.codes).length} HCPCS codes via ${found.via}`,
  );
}

async function crawlLoop() {
  if (looping) return;
  looping = true;
  markRunning(true);
  try {
    while (queue.length > 0 || priority.size > 0) {
      const id = [...priority][0] ?? queue.shift();
      if (!id) break;
      if (inFlight.has(id)) {
        priority.delete(id);
        continue;
      }
      if (!isStale(id) && hospitalHasSnapshot(id)) {
        priority.delete(id);
        continue;
      }
      priority.delete(id);
      inFlight.add(id);
      try {
        await crawlOne(id);
      } catch (err) {
        const hospital = getHospitalById(id);
        console.warn(`[hpt] Failed ${id}:`, err);
        upsertHospitalMeta({
          facilityId: id,
          zip3: hospital?.zip3 ?? "",
          name: hospital?.name,
          status: "failed",
          lastAttemptAt: new Date().toISOString(),
          lastOkAt: loadStatus().hospitals[id]?.lastOkAt ?? null,
          snapshots: loadStatus().hospitals[id]?.snapshots ?? [],
          error: err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
        });
        codeFilters.delete(id);
      } finally {
        inFlight.delete(id);
      }
      await new Promise((r) => setTimeout(r, BETWEEN_HOSPITAL_MS));
    }
  } finally {
    looping = false;
    markRunning(false);
  }
}

export async function ensureHospitalCrawled(
  hospital: HospitalSummary,
  codes?: string[],
): Promise<{ ready: boolean; error?: string }> {
  if (hospitalHasSnapshot(hospital.facilityId) && !isStale(hospital.facilityId)) {
    return { ready: true };
  }
  const rec = loadStatus().hospitals[hospital.facilityId];
  prioritizeHospitals([hospital.facilityId], codes);
  if (rec?.status === "failed" && rec.error && rec.lastAttemptAt) {
    const age = Date.now() - Date.parse(rec.lastAttemptAt);
    // Allow retry sooner for timeout / oversized-file failures after a redeploy.
    if (age < 3 * 60 * 1000) return { ready: false, error: rec.error };
  }
  return { ready: hospitalHasSnapshot(hospital.facilityId), error: rec?.error };
}

/**
 * Opt-in national crawl. Default is OFF on the web service so free-tier
 * Render instances stay responsive; run `npm run crawl:hpt` or set
 * INGEST_HPT=true when you want background nationwide ingestion.
 */
export function startNationalHptCrawl(isReady: () => boolean = isHospitalDirectoryReady) {
  if (process.env.INGEST_HPT !== "true") {
    console.log(
      "[hpt] National crawl idle (set INGEST_HPT=true or use npm run crawl:hpt). On-demand crawls still run from the Pricing page.",
    );
    return;
  }
  const wait = async () => {
    while (!isReady()) {
      await new Promise((r) => setTimeout(r, 4000));
    }
    const delayMs = Number(process.env.HPT_START_DELAY_MS ?? 90_000);
    if (delayMs > 0) {
      console.log(`[hpt] Score cache ready — delaying national MRF crawl ${Math.round(delayMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    seedNationalQueue();
    console.log(`[hpt] Starting national MRF crawl (${getCoverage().hospitalCount} hospitals in directory)`);
    void crawlLoop();
  };
  wait().catch((err) => console.warn("[hpt] Crawl failed to start:", err));
}

export { crawlOne };
