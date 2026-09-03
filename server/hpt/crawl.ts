import type { HospitalSummary } from "../../shared/types.js";
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
let queue: string[] = [];
let looping = false;
const inFlight = new Set<string>();
const priority = new Set<string>();

function isStale(facilityId: string): boolean {
  const rec = loadStatus().hospitals[facilityId];
  if (!rec?.lastOkAt) return true;
  return Date.now() - Date.parse(rec.lastOkAt) > STALE_MS;
}

function seedQueue(preferred: string[] = []) {
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

export function prioritizeHospitals(ids: string[]) {
  for (const id of ids) priority.add(id);
  queue = [...new Set([...ids, ...queue])];
  void crawlLoop();
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

  const parsed = await parseMrfUrl(found.mrfUrl);
  const date = new Date().toISOString().slice(0, 10);
  await upsertHospitalCharges({
    facilityId,
    zip3: hospital.zip3,
    date,
    mrfUrl: found.mrfUrl,
    codes: parsed.codes,
  });
  console.log(`[hpt] ${hospital.facilityId} ${hospital.name}: ${Object.keys(parsed.codes).length} HCPCS codes via ${found.via}`);
}

async function crawlLoop() {
  if (looping) return;
  looping = true;
  markRunning(true);
  try {
    if (queue.length === 0) seedQueue([...priority]);
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
      } finally {
        inFlight.delete(id);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    looping = false;
    markRunning(false);
  }
}

export async function ensureHospitalCrawled(hospital: HospitalSummary): Promise<boolean> {
  if (hospitalHasSnapshot(hospital.facilityId) && !isStale(hospital.facilityId)) return true;
  prioritizeHospitals([hospital.facilityId]);
  return hospitalHasSnapshot(hospital.facilityId);
}

export function startNationalHptCrawl(isReady: () => boolean = isHospitalDirectoryReady) {
  if (process.env.INGEST_HPT === "false") {
    console.log("[hpt] National crawl disabled (INGEST_HPT=false)");
    return;
  }
  const wait = async () => {
    while (!isReady()) {
      await new Promise((r) => setTimeout(r, 4000));
    }
    seedQueue();
    console.log(`[hpt] Starting national MRF crawl (${getCoverage().hospitalCount} hospitals in directory)`);
    void crawlLoop();
  };
  wait().catch((err) => console.warn("[hpt] Crawl failed to start:", err));
}

export { crawlOne };
