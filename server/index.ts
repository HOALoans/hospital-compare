import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
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
  refreshScoreCache,
  startScheduledRefresh,
} from "./cache.js";
import { buildComparison } from "./comparisons.js";
import { scheduleArchiveIngest, sampleTrendYearCoverage, runArchiveIngest } from "./archiveIngest.js";
import { handleAdminLogin, handleAdminLogout, requireAdmin } from "./adminAuth.js";
import {
  initPartnerStore,
  getPartner,
  getAllPartners,
  partnerExists,
  createPartner,
  updatePartner,
  deletePartner,
  setPartnerLogo,
  removeOldLogos,
  LOGOS_DIR,
} from "./partnerStore.js";
import { ARCHIVE_DIR } from "./dataPaths.js";
import { getSavedComparison, saveComparison } from "./savedComparisons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5175);

const LOGO_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (LOGO_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error("Logo must be PNG, JPG, SVG, or WebP"));
  },
});

const app = express();
app.use(express.json());

function appOrigin(req: express.Request): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("host");
  return host ? `${proto}://${host}` : "https://parigrado.com";
}

// --- Partner branding (public read) ---
app.get("/api/partners/:id", (req, res) => {
  const id = req.params.id;
  if (!partnerExists(id)) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  res.json(getPartner(id));
});

app.get("/api/partner-logos/:filename", (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(LOGOS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Logo not found" });
    return;
  }
  res.sendFile(filePath);
});

// --- Partner admin auth ---
app.post("/api/admin/login", handleAdminLogin);
app.post("/api/admin/logout", handleAdminLogout);

// --- Partner admin (protected) ---
app.get("/api/admin/partners", requireAdmin, (_req, res) => {
  res.json({ partners: getAllPartners() });
});

app.get("/api/admin/partners/:id", requireAdmin, (req, res) => {
  if (!partnerExists(req.params.id)) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  res.json(getPartner(req.params.id));
});

app.post("/api/admin/partners", requireAdmin, (req, res) => {
  const result = createPartner(req.body ?? {});
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(result.partner);
});

app.put("/api/admin/partners/:id", requireAdmin, (req, res) => {
  const result = updatePartner(req.params.id, req.body ?? {});
  if (!result.ok) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }
  res.json(result.partner);
});

app.delete("/api/admin/partners/:id", requireAdmin, (req, res) => {
  const result = deletePartner(req.params.id);
  if (!result.ok) {
    res.status(result.status ?? 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

app.post(
  "/api/admin/partners/:id/logo",
  requireAdmin,
  (req, res, next) => {
    logoUpload.single("logo")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
        return;
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "logo file is required" });
      return;
    }
    const ext = LOGO_MIME_EXT[req.file.mimetype];
    if (!ext) {
      res.status(400).json({ error: "Unsupported image type" });
      return;
    }
    const filename = `${req.params.id}.${ext}`;
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
    removeOldLogos(req.params.id, filename);
    fs.writeFileSync(path.join(LOGOS_DIR, filename), req.file.buffer);
    const result = setPartnerLogo(req.params.id, filename);
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.error });
      return;
    }
    res.json(result.partner);
  },
);

// Force an immediate CMS score-cache reload (and optionally re-ingest archive
// trends in the background). Complements the in-process scheduled refresh.
app.post("/api/admin/refresh", requireAdmin, async (req, res) => {
  const reingestArchives = req.body?.reingestArchives === true;
  try {
    const result = await refreshScoreCache({ force: true });
    if (reingestArchives) {
      runArchiveIngest({ force: true }).catch((err) => {
        console.warn("[archives] Admin-triggered re-ingest error:", err);
      });
    }
    res.json({
      ok: true,
      refreshed: result.refreshed,
      reason: result.reason,
      reportingPeriod: getCurrentPeriod(),
      lastCacheRefresh: getLastCacheRefresh(),
      archiveReingestStarted: reingestArchives,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Refresh failed" });
  }
});

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

app.post("/api/watchlist", (req, res) => {
  const { email, facilityId } = req.body ?? {};
  if (!email || !facilityId) {
    res.status(400).json({ error: "email and facilityId required" });
    return;
  }
  console.log(`[watchlist] Interest registered: ${email} for ${facilityId}`);
  res.json({ ok: true, message: "Thanks — email alerts are not live yet; saved locally in your browser." });
});

app.post("/api/saved-comparisons", (req, res) => {
  try {
    const { record, shareUrl } = saveComparison(req.body ?? {}, appOrigin(req));
    res.status(201).json({
      code: record.code,
      label: record.label,
      shareUrl,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      hospitalId: record.hospitalId,
      compareWith: record.compareWith,
      peers: record.peers,
      stateFilter: record.stateFilter,
      groupFilter: record.groupFilter,
      partner: record.partner,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not save comparison" });
  }
});

app.get("/api/saved-comparisons/:code", (req, res) => {
  const record = getSavedComparison(req.params.code);
  if (!record) {
    res.status(404).json({
      error:
        "This saved comparison link was not found. It may have expired, or the comparison was never saved on this server. Open the hospital comparison again and use Save comparison to create a new shareable link.",
    });
    return;
  }
  const shareUrl = `${appOrigin(req)}/?saved=${encodeURIComponent(record.code)}`;
  res.json({ ...record, shareUrl });
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
  const coverage = sampleTrendYearCoverage(40);
  const totalHospitals = getHospitals().length;
  const estimatedYears = ARCHIVE_YEARS.length;
  res.json({
    archiveYears: ARCHIVE_YEARS,
    cmsArchiveUrl: "https://data.cms.gov/provider-data/archived-data/hospitals",
    ingestedHospitalCount: coverage.fileCount,
    totalHospitalCount: totalHospitals,
    estimatedYearProgress: coverage.yearsSeen.length,
    estimatedYearsTotal: estimatedYears,
    sampleYears: coverage.yearsSeen,
    lastCacheRefresh: getLastCacheRefresh(),
    reportingPeriod: getCurrentPeriod(),
    note: "CMS maintains downloadable hospital data archives for the past 7 years per federal policy.",
  });
});

const clientDist = path.join(__dirname, "../client");
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      // index.html must always revalidate so a new deploy's hashed bundle
      // references are picked up immediately (prevents stale-bundle blank pages).
      // Vite's content-hashed /assets files are safe to cache forever.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  // Never fall back to index.html for a missing static asset (e.g. an old
  // hashed bundle a stale client still references). Serving HTML in place of a
  // JS/CSS module makes the browser refuse it and blanks the page — fail with a
  // real 404 so the stale client reloads index.html and self-heals instead.
  app.get(/\.(?:js|mjs|css|map|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot)$/i, (_req, res) => {
    res.status(404).end();
  });
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function start() {
  initPartnerStore();

  initializeCache().catch((err) => {
    console.error("[cache] Failed to initialize:", err);
  });

  // Keep a long-lived instance from serving stale CMS scores: periodically
  // reload from CMS when the cache ages past the refresh window (default 7d)
  // or CMS publishes a newer reporting period.
  startScheduledRefresh();

  if (process.env.INGEST_ARCHIVES !== "false") {
    // Wait until the primary score cache is ready before starting the heavy
    // archive ingest so the two don't compete for the 512MB free-tier heap.
    scheduleArchiveIngest(isCacheReady).catch((err) => {
      console.warn("[archives] Background ingest error:", err);
    });
  }

  app.listen(PORT, () => {
    console.log(`Parigrado listening on port ${PORT}`);
  });
}

start();
