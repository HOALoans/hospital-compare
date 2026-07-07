import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { ARCHIVE_YEARS } from "../shared/measures.js";
import type { HospitalTrend } from "../shared/types.js";
import {
  initializeCache,
  isCacheReady,
  isHospitalDirectoryReady,
  searchHospitals,
  getHospitals,
  getHospitalById,
  findNearbyHospitals,
  getCurrentPeriod,
  getLastCacheRefresh,
} from "./cache.js";
import { buildComparison } from "./comparisons.js";
import { scheduleArchiveIngest } from "./archiveIngest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.join(__dirname, "../.cache/archives");
const PORT = Number(process.env.PORT ?? 5175);

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ready: isCacheReady(),
    directoryReady: isHospitalDirectoryReady(),
    hospitalCount: getHospitals().length,
    reportingPeriod: getCurrentPeriod(),
    lastCacheRefresh: getLastCacheRefresh(),
  });
});

app.get("/api/hospitals/search", (req, res) => {
  if (!isHospitalDirectoryReady()) {
    res.status(503).json({ error: "Hospital directory is still loading. Try again shortly." });
    return;
  }
  const q = String(req.query.q ?? "");
  const state = req.query.state ? String(req.query.state) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  res.json({ query: q, hospitals: searchHospitals(q, state, limit) });
});

app.get("/api/hospitals/:facilityId/nearby", (req, res) => {
  if (!isHospitalDirectoryReady()) {
    res.status(503).json({ error: "Hospital directory is still loading." });
    return;
  }
  const hospital = getHospitalById(req.params.facilityId);
  if (!hospital) {
    res.status(404).json({ error: "Hospital not found" });
    return;
  }
  const limit = req.query.limit ? Number(req.query.limit) : 12;
  res.json({ hospital, nearby: findNearbyHospitals(req.params.facilityId, limit) });
});

app.get("/api/hospitals/:facilityId", (req, res) => {
  if (!isHospitalDirectoryReady()) {
    res.status(503).json({ error: "Hospital directory is still loading." });
    return;
  }
  const hospital = getHospitalById(req.params.facilityId);
  if (!hospital) {
    res.status(404).json({ error: "Hospital not found" });
    return;
  }
  res.json(hospital);
});

app.get("/api/watchlist", (_req, res) => {
  res.json({
    message: "Watchlist is stored locally in your browser. Backend email notifications coming soon.",
    stub: true,
  });
});

app.post("/api/watchlist", express.json(), (req, res) => {
  const { email, facilityId } = req.body ?? {};
  if (!email || !facilityId) {
    res.status(400).json({ error: "email and facilityId required" });
    return;
  }
  console.log(`[watchlist] Interest registered: ${email} for ${facilityId}`);
  res.json({ ok: true, message: "Thanks — email alerts are not live yet; saved locally in your browser." });
});

app.get("/api/hospitals/:facilityId/compare", (req, res) => {
  if (!isCacheReady()) {
    res.status(503).json({ error: "Quality scores are still loading. Try again shortly." });
    return;
  }
  const compareWith = String(req.query.compareWith ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const comparison = buildComparison(req.params.facilityId, compareWith);
  if (!comparison) {
    res.status(404).json({ error: "Hospital not found" });
    return;
  }
  res.json(comparison);
});

app.get("/api/hospitals/:facilityId/trends", (req, res) => {
  const facilityId = req.params.facilityId;
  const file = path.join(ARCHIVE_DIR, `${facilityId}.json`);
  if (!fs.existsSync(file)) {
    const empty: HospitalTrend = { facilityId, points: [] };
    res.json({
      ...empty,
      message: "Historical trends are imported automatically from CMS archives in the background.",
      availableYears: ARCHIVE_YEARS,
    });
    return;
  }
  res.json(JSON.parse(fs.readFileSync(file, "utf8")) as HospitalTrend);
});

app.get("/api/meta/archives", (_req, res) => {
  const ingested = fs.existsSync(ARCHIVE_DIR)
    ? fs.readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith(".json")).length
    : 0;
  const totalHospitals = getHospitals().length;
  const estimatedYears = ARCHIVE_YEARS.length;
  const yearProgress = totalHospitals > 0
    ? Math.min(estimatedYears, Math.ceil((ingested / totalHospitals) * estimatedYears))
    : 0;
  res.json({
    archiveYears: ARCHIVE_YEARS,
    cmsArchiveUrl: "https://data.cms.gov/provider-data/archived-data/hospitals",
    ingestedHospitalCount: ingested,
    totalHospitalCount: totalHospitals,
    estimatedYearProgress: yearProgress,
    estimatedYearsTotal: estimatedYears,
    lastCacheRefresh: getLastCacheRefresh(),
    reportingPeriod: getCurrentPeriod(),
    note: "CMS maintains downloadable hospital data archives for the past 7 years per federal policy.",
  });
});

const clientDist = path.join(__dirname, "../client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function start() {
  initializeCache().catch((err) => {
    console.error("[cache] Failed to initialize:", err);
  });

  if (process.env.INGEST_ARCHIVES !== "false") {
    scheduleArchiveIngest().catch((err) => {
      console.warn("[archives] Background ingest error:", err);
    });
  }

  app.listen(PORT, () => {
    console.log(`Parigrado.com listening on port ${PORT}`);
  });
}

start();
