import fs from "fs";
import path from "path";
import {
  HPT_CODES_DIR,
  HPT_HOSPITALS_DIR,
  HPT_STATUS_FILE,
  HPT_DIR,
} from "../dataPaths.js";
import type { HptChargePoint, HptCoverage } from "../../shared/hpt.js";

const MAX_SNAPSHOTS = 12;

export interface HospitalCrawlRecord {
  facilityId: string;
  zip3: string;
  name?: string;
  status: "ok" | "failed" | "pending";
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  error?: string;
  mrfUrl?: string;
  codeCount?: number;
  snapshots: { date: string; mrfUrl: string; codeCount: number }[];
}

export interface CrawlStatusFile {
  running: boolean;
  lastCrawlAt: string | null;
  cursor: number;
  hospitals: Record<string, HospitalCrawlRecord>;
}

export interface CodeShard {
  code: string;
  description: string | null;
  byFacility: Record<string, HptChargePoint[]>;
}

function emptyStatus(): CrawlStatusFile {
  return { running: false, lastCrawlAt: null, cursor: 0, hospitals: {} };
}

function ensureDirs() {
  fs.mkdirSync(HPT_DIR, { recursive: true });
  fs.mkdirSync(HPT_HOSPITALS_DIR, { recursive: true });
  fs.mkdirSync(HPT_CODES_DIR, { recursive: true });
}

function atomicWrite(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

let statusCache: CrawlStatusFile | null = null;

export function loadStatus(): CrawlStatusFile {
  if (statusCache) return statusCache;
  ensureDirs();
  if (!fs.existsSync(HPT_STATUS_FILE)) {
    statusCache = emptyStatus();
    return statusCache;
  }
  try {
    statusCache = JSON.parse(fs.readFileSync(HPT_STATUS_FILE, "utf8")) as CrawlStatusFile;
    statusCache.running = false;
    return statusCache;
  } catch {
    statusCache = emptyStatus();
    return statusCache;
  }
}

export function saveStatus() {
  if (!statusCache) return;
  atomicWrite(HPT_STATUS_FILE, JSON.stringify(statusCache));
}

export function getCoverage(): HptCoverage {
  const st = loadStatus();
  const rows = Object.values(st.hospitals);
  return {
    hospitalCount: rows.length,
    crawledOk: rows.filter((r) => r.status === "ok").length,
    crawledFailed: rows.filter((r) => r.status === "failed").length,
    pending: rows.filter((r) => r.status === "pending" || !r.lastAttemptAt).length,
    lastCrawlAt: st.lastCrawlAt,
    running: st.running,
  };
}

export function upsertHospitalMeta(rec: HospitalCrawlRecord) {
  const st = loadStatus();
  st.hospitals[rec.facilityId] = rec;
  saveStatus();
}

export function markRunning(running: boolean) {
  const st = loadStatus();
  st.running = running;
  if (!running) st.lastCrawlAt = new Date().toISOString();
  saveStatus();
}

function shardPath(code: string) {
  const safe = code.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 32);
  const prefix = safe.slice(0, 2).toLowerCase() || "_";
  return path.join(HPT_CODES_DIR, prefix, `${safe}.json`);
}

const shardLocks = new Map<string, Promise<void>>();

function withShardLock(code: string, fn: () => void): Promise<void> {
  const prev = shardLocks.get(code) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  shardLocks.set(code, next);
  return next;
}

function loadShard(code: string): CodeShard {
  const file = shardPath(code);
  if (!fs.existsSync(file)) return { code, description: null, byFacility: {} };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CodeShard;
  } catch {
    return { code, description: null, byFacility: {} };
  }
}

function writeShard(shard: CodeShard) {
  atomicWrite(shardPath(shard.code), JSON.stringify(shard));
}

export async function upsertHospitalCharges(opts: {
  facilityId: string;
  zip3: string;
  date: string;
  mrfUrl: string;
  codes: Record<
    string,
    { description: string | null; cash: number | null; allMean: number | null; allMedian: number | null; allN: number }
  >;
}) {
  const entries = Object.entries(opts.codes);
  for (const [code, row] of entries) {
    await withShardLock(code, () => {
      const shard = loadShard(code);
      if (row.description && !shard.description) shard.description = row.description;
      const list = shard.byFacility[opts.facilityId] ?? [];
      const point: HptChargePoint = {
        date: opts.date,
        zip3: opts.zip3,
        cash: row.cash,
        allMean: row.allMean,
        allMedian: row.allMedian,
        allN: row.allN,
      };
      const without = list.filter((p) => p.date !== opts.date);
      without.push(point);
      without.sort((a, b) => a.date.localeCompare(b.date));
      shard.byFacility[opts.facilityId] = without.slice(-MAX_SNAPSHOTS);
      writeShard(shard);
    });
  }

  const st = loadStatus();
  const rec = st.hospitals[opts.facilityId] ?? {
    facilityId: opts.facilityId,
    zip3: opts.zip3,
    status: "ok" as const,
    lastAttemptAt: null,
    lastOkAt: null,
    snapshots: [],
  };
  rec.status = "ok";
  rec.zip3 = opts.zip3;
  rec.lastAttemptAt = new Date().toISOString();
  rec.lastOkAt = rec.lastAttemptAt;
  rec.mrfUrl = opts.mrfUrl;
  rec.codeCount = entries.length;
  rec.error = undefined;
  rec.snapshots = [
    ...rec.snapshots.filter((s) => s.date !== opts.date),
    { date: opts.date, mrfUrl: opts.mrfUrl, codeCount: entries.length },
  ].slice(-MAX_SNAPSHOTS);
  st.hospitals[opts.facilityId] = rec;
  st.lastCrawlAt = rec.lastOkAt;
  saveStatus();
}

export function getCodeShard(code: string): CodeShard {
  return loadShard(code);
}

export function latestPoint(points: HptChargePoint[] | undefined): HptChargePoint | null {
  if (!points?.length) return null;
  return points[points.length - 1] ?? null;
}

export function hospitalHasSnapshot(facilityId: string): boolean {
  const rec = loadStatus().hospitals[facilityId];
  return rec?.status === "ok" && (rec.codeCount ?? 0) > 0;
}
