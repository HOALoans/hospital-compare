import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import { ARCHIVE_YEARS, COMPARISON_MEASURES } from "../shared/measures.js";
import type { HcaNationalHospital, HcaNationalResponse, HospitalSummary, HospitalTrend } from "../shared/types.js";
import {
  HCA_NATIONAL_AS_OF,
  HCA_NATIONAL_FACILITY_IDS,
  HCA_NATIONAL_SOURCE,
  HCA_PEER_KEY_ALL,
} from "../shared/hcaNationalFacilities.js";
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
  getPeerAverage,
  getNationalBenchmark,
  getFacilityScores,
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
import { cmsRateLimiter, hospitalRateLimiter, financeRateLimiter, rateLimitConfig } from "./rateLimit.js";
import {
  CHART_RANGES,
  fetchHcaAnalysts,
  fetchHcaChart,
  fetchHcaInsiders,
  type ChartRangeKey,
} from "./financeProxy.js";
import { getCoverage } from "./hpt/store.js";
import { buildHptComparison } from "./hpt/compare.js";
import { startNationalHptCrawl } from "./hpt/crawl.js";

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
// Render (and most PaaS) terminate TLS upstream and set X-Forwarded-For.
// Required so rate limits key on the real client IP, not the proxy.
app.set("trust proxy", 1);
app.use(express.json());

const limitCms = cmsRateLimiter();
const limitHospital = hospitalRateLimiter();
const limitFinance = financeRateLimiter();

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
    hpt: getCoverage(),
  });
});

app.get("/api/hca/national", limitHospital, (_req, res) => {
  if (!isHospitalDirectoryReady()) {
    res.status(503).json({ error: "Hospital directory is still loading. Try again shortly." });
    return;
  }
  if (!isCacheReady()) {
    res.status(503).json({ error: "Quality scores are still loading. Try again shortly." });
    return;
  }

  const matched: HcaNationalHospital[] = [];
  const missingIds: string[] = [];
  for (const id of HCA_NATIONAL_FACILITY_IDS) {
    const h = getHospitalById(id);
    if (!h) {
      missingIds.push(id);
      continue;
    }
    const scoreRows = getFacilityScores(id);
    const scores: Record<string, number | null> = {};
    for (const def of COMPARISON_MEASURES) {
      scores[def.id] = null;
    }
    for (const row of scoreRows) {
      scores[row.measureId] = row.value;
    }
    matched.push({ ...h, scores });
  }
  matched.sort(
    (a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name),
  );

  const measures = COMPARISON_MEASURES.map((def) => {
    const peer = getPeerAverage(HCA_PEER_KEY_ALL, def.id);
    return {
      measureId: def.id,
      hcaAverage: peer.value,
      nationalAverage: getNationalBenchmark(def.id),
      hcaHospitalCount: peer.count,
    };
  });

  const payload: HcaNationalResponse = {
    rosterCount: HCA_NATIONAL_FACILITY_IDS.length,
    matchedCount: matched.length,
    source: HCA_NATIONAL_SOURCE,
    asOf: HCA_NATIONAL_AS_OF,
    period: getCurrentPeriod(),
    measures,
    hospitals: matched,
    missingIds,
  };
  res.json(payload);
});

app.get("/api/hospitals/search", limitHospital, (req, res) => {
  if (!isHospitalDirectoryReady()) {
    res.status(503).json({ error: "Hospital directory is still loading. Try again shortly." });
    return;
  }
  const q = String(req.query.q ?? "");
  const state = req.query.state ? String(req.query.state) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  res.json({ query: q, hospitals: searchHospitals(q, state, limit) });
});

app.get("/api/hospitals/:facilityId/nearby", limitHospital, (req, res) => {
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

app.get("/api/hospitals/:facilityId", limitHospital, (req, res) => {
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

app.get("/api/hpt/status", limitHospital, (_req, res) => {
  res.json(getCoverage());
});

app.get("/api/hpt/compare", limitHospital, async (req, res) => {
  if (!isHospitalDirectoryReady()) {
    res.status(503).json({ error: "Hospital directory is still loading. Try again shortly." });
    return;
  }
  const facilityId = String(req.query.hospital ?? "").trim();
  if (!facilityId) {
    res.status(400).json({ error: "hospital is required" });
    return;
  }
  const codes = String(req.query.codes ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) {
    res.status(400).json({ error: "codes is required (comma-separated HCPCS)" });
    return;
  }
  const metric = req.query.metric === "mean" ? "mean" : "median";
  const payer = req.query.payer === "all" ? "all" : "cash";
  const compareWith = String(req.query.compare ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const result = await buildHptComparison({ facilityId, codes, compareWith, metric, payer });
    if (!result) {
      res.status(404).json({ error: "Hospital not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error("[hpt-compare]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Comparison failed" });
  }
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

app.get("/api/hospitals/:facilityId/compare", limitHospital, (req, res) => {
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

app.get("/api/hospitals/:facilityId/trends", limitHospital, (req, res) => {
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

function cookieHasHideHca(req: express.Request): boolean {
  const raw = req.headers.cookie ?? "";
  return /(?:^|;\s*)parigrado_hide_hca=1(?:;|$)/.test(raw);
}

/** Legacy path — dashboard lives at /hca/ (respect AARP hide-HCA cookie). */
app.get(["/hca-watchdog", "/hca-watchdog/"], (req, res) => {
  if (cookieHasHideHca(req)) {
    res.redirect(302, "/");
    return;
  }
  res.redirect(301, "/hca/");
});

/** Short partner URLs (branded Parigrado layout; HCA News hidden). */
app.get(["/aarp", "/aarp/"], (_req, res) => {
  res.redirect(302, "/?partner=aarp");
});
app.get(["/aarp-open", "/aarp-open/"], (_req, res) => {
  res.redirect(302, "/?partner=aarp-open");
});
app.get(["/florida-blue", "/florida-blue/"], (_req, res) => {
  res.redirect(302, "/?partner=florida-blue");
});
app.get(["/florida-blue-open", "/florida-blue-open/"], (_req, res) => {
  res.redirect(302, "/?partner=florida-blue-open");
});

/** HCA dashboard: chart, analysts, insiders (avoids CORS / keys in client). */
app.get("/api/finance/hca/chart", limitFinance, async (req, res) => {
  const rawRange = String(req.query.range ?? "3mo").trim();
  const range = (rawRange in CHART_RANGES ? rawRange : "3mo") as ChartRangeKey;
  try {
    const data = await fetchHcaChart(range);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(data);
  } catch (err) {
    console.error("[finance-chart]", err);
    res.status(502).json({
      error: "Failed to fetch HCA chart data",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/finance/hca/analysts", limitFinance, async (_req, res) => {
  try {
    const data = await fetchHcaAnalysts();
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (err) {
    console.error("[finance-analysts]", err);
    res.status(502).json({
      error: "Failed to fetch HCA analyst ratings",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/finance/hca/insiders", limitFinance, async (_req, res) => {
  try {
    const data = await fetchHcaInsiders();
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (err) {
    console.error("[finance-insiders]", err);
    res.status(502).json({
      error: "Failed to fetch HCA insider transactions",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Browser-safe proxy for Hospital Health Dashboard CMS pulls (avoids CORS). */
const CMS_PROXY_DATASETS = new Set([
  "dgck-syfz", // HCAHPS hospital
  "xubh-q36u", // hospital general info
  "77hc-ibv8", // HAI
  "ynj2-r877", // complications & deaths hospital
  "qqw3-t4ie", // complications & deaths national
  "632h-zaca", // unplanned visits hospital
  "cvcs-xecj", // unplanned visits national
  "99ue-w85f", // HCAHPS national
]);

app.post("/api/cms/query/:dataset", limitCms, async (req, res) => {
  const dataset = String(req.params.dataset || "").trim();
  if (!/^[a-z0-9-]+$/i.test(dataset) || !CMS_PROXY_DATASETS.has(dataset)) {
    res.status(400).json({ error: "Dataset not allowed" });
    return;
  }
  try {
    const upstream = await fetch(
      `https://data.cms.gov/provider-data/api/1/datastore/query/${dataset}/0`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(req.body ?? { limit: 100 }),
      },
    );
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("[cms-proxy]", dataset, err);
    res.status(502).json({ error: "Failed to reach CMS Provider Data API" });
  }
});

/** Block /hca for hideHcaNav partners (cookie set by React PartnerContext). */
app.get(["/hca", "/hca/", "/hca/index.html"], (req, res, next) => {
  if (cookieHasHideHca(req)) {
    res.redirect(302, "/");
    return;
  }
  next();
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
    scheduleArchiveIngest(isCacheReady).catch((err) => {
      console.warn("[archives] Background ingest error:", err);
    });
  }

  startNationalHptCrawl(isHospitalDirectoryReady);

  app.listen(PORT, () => {
    const rl = rateLimitConfig();
    console.log(`Parigrado listening on port ${PORT}`);
    if (rl.disabled) {
      console.log("[rate-limit] disabled (RATE_LIMIT_DISABLED)");
    } else {
      console.log(
        `[rate-limit] window=${rl.windowMs}ms cms=${rl.cmsMax}/ip hospital=${rl.hospitalMax}/ip finance=${rl.financeMax}/ip`,
      );
    }
  });
}

start();
