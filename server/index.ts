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

app.get("/api/hospitals/:facilityId/compare", (req, res) => {
  if (!isCacheReady()) {
    res.status(503).json({ error: "Quality scores are still loading. Try again shortly." });
    return;
  }
  const comparison = buildComparison(req.params.facilityId);
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
  res.json({
    archiveYears: ARCHIVE_YEARS,
    cmsArchiveUrl: "https://data.cms.gov/provider-data/archived-data/hospitals",
    ingestedHospitalCount: ingested,
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
    console.log(`CareLens Hospital Compare listening on port ${PORT}`);
  });
}

start();
