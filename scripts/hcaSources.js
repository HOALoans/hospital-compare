/**
 * Persistent HCA dashboard source universe.
 *
 * Manual article adds (and daily auto-updates) land sources in public/hca/index.html.
 * This module extracts those outlets into scripts/hca-sources.json so morning
 * refreshes always check every source that has ever appeared on the page.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HCA_SOURCES_PATH = path.join(__dirname, "hca-sources.json");

/** Built-in outlets always checked (even before any HTML scrape). */
export const DEFAULT_OUTLETS = [
  { name: "Asheville Watchdog", host: "avlwatchdog.org" },
  { name: "Blue Ridge Public Radio (BPR)", host: "bpr.org" },
  { name: "NC Health News", host: "northcarolinahealthnews.org" },
  { name: "WLOS", host: "wlos.com" },
  { name: "Becker's Hospital Review", host: "beckershospitalreview.com" },
  { name: "Dogwood Health Trust", host: "dogwoodhealthtrust.org" },
  { name: "Washington Post / KFF Health News", host: "kffhealthnews.org" },
  { name: "NC Department of Justice", host: "ncdoj.gov" },
  { name: "CMS", host: "cms.gov" },
  { name: "HCA Healthcare Investor Relations", host: "investor.hcahealthcare.com" },
  { name: "National Nurses United", host: "nationalnursesunited.org" },
  { name: "National Nurses United / Too Big to Care", host: "toobig2care.org" },
  { name: "MarketBeat", host: "marketbeat.com" },
  { name: "Congress.gov", host: "congress.gov" },
];

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceKey(entry) {
  const host = (entry.host || "").toLowerCase();
  if (host) return `host:${host}`;
  return `name:${(entry.name || "").toLowerCase()}`;
}

export function loadHcaSources() {
  if (!fs.existsSync(HCA_SOURCES_PATH)) {
    return { updatedAt: null, sources: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(HCA_SOURCES_PATH, "utf8"));
    return {
      updatedAt: raw.updatedAt || null,
      sources: Array.isArray(raw.sources) ? raw.sources : [],
    };
  } catch {
    return { updatedAt: null, sources: [] };
  }
}

export function saveHcaSources(sources) {
  const cleaned = [...sources]
    .filter((s) => s && (s.name || s.host))
    .map((s) => ({
      name: String(s.name || s.host || "").trim(),
      host: String(s.host || "").trim().toLowerCase(),
      exampleUrl: s.exampleUrl || undefined,
      firstSeen: s.firstSeen || undefined,
      lastSeen: s.lastSeen || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    updatedAt: new Date().toISOString(),
    sources: cleaned,
  };
  fs.writeFileSync(HCA_SOURCES_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

/**
 * Extract outlet names + URLs from news / financial news / talking-point blocks.
 */
export function extractSourcesFromHtml(html) {
  const found = [];
  const now = new Date().toISOString().slice(0, 10);

  // Linked source labels: <a ... class="news-source ...">Name</a>
  const linkedSourceRe =
    /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*news-source[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkedSourceRe.exec(html)) !== null) {
    found.push({
      name: decodeHtml(m[2].replace(/<[^>]+>/g, "")),
      host: hostFromUrl(m[1]),
      exampleUrl: m[1],
      firstSeen: now,
      lastSeen: now,
    });
  }

  // Plain source spans without links
  const plainSourceRe = /<span class="news-source">([\s\S]*?)<\/span>/gi;
  while ((m = plainSourceRe.exec(html)) !== null) {
    const name = decodeHtml(m[1].replace(/<[^>]+>/g, ""));
    if (!name) continue;
    found.push({
      name,
      host: "",
      firstSeen: now,
      lastSeen: now,
    });
  }

  // Talking-point source links
  const tpSourceRe =
    /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*tp-source-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = tpSourceRe.exec(html)) !== null) {
    found.push({
      name: decodeHtml(m[2].replace(/<[^>]+>/g, "")),
      host: hostFromUrl(m[1]),
      exampleUrl: m[1],
      firstSeen: now,
      lastSeen: now,
    });
  }

  // Headline article URLs (capture host even if source label is generic)
  const headlineRe =
    /<h2 class="news-headline"><a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi;
  while ((m = headlineRe.exec(html)) !== null) {
    const host = hostFromUrl(m[1]);
    if (!host) continue;
    found.push({
      name: host,
      host,
      exampleUrl: m[1],
      firstSeen: now,
      lastSeen: now,
    });
  }

  return found;
}

export function extractSourcesFromNewsItems(items = []) {
  const now = new Date().toISOString().slice(0, 10);
  const found = [];
  for (const item of items) {
    const url = item?.url || item?.sourceUrl || "";
    const name = (item?.source || "").trim();
    const host = hostFromUrl(url);
    if (!name && !host) continue;
    found.push({
      name: name || host,
      host,
      exampleUrl: url || undefined,
      firstSeen: now,
      lastSeen: now,
    });
  }
  return found;
}

export function mergeSources(...lists) {
  const defaultByHost = new Map(
    DEFAULT_OUTLETS.filter((d) => d.host).map((d) => [d.host.toLowerCase(), d.name]),
  );
  const map = new Map();
  for (const list of lists) {
    for (const entry of list || []) {
      if (!entry) continue;
      const key = sourceKey(entry);
      if (!key || key === "name:" || key === "host:") continue;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...entry });
        continue;
      }
      map.set(key, {
        name:
          entry.name && entry.name !== entry.host
            ? entry.name
            : prev.name && prev.name !== prev.host
              ? prev.name
              : entry.name || prev.name,
        host: entry.host || prev.host || "",
        exampleUrl: entry.exampleUrl || prev.exampleUrl,
        firstSeen: prev.firstSeen || entry.firstSeen,
        lastSeen: entry.lastSeen || prev.lastSeen,
      });
    }
  }
  // Prefer canonical outlet names from DEFAULT_OUTLETS when host matches.
  for (const entry of map.values()) {
    if (entry.host && defaultByHost.has(entry.host)) {
      entry.name = defaultByHost.get(entry.host);
    }
  }
  return [...map.values()];
}

/**
 * Sync registry from current dashboard HTML. Returns { added, total, sources }.
 */
export function syncSourcesFromHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const existing = loadHcaSources();
  const fromHtml = extractSourcesFromHtml(html);
  const merged = mergeSources(DEFAULT_OUTLETS, existing.sources, fromHtml);
  const before = new Set(existing.sources.map(sourceKey));
  const added = merged.filter((s) => !before.has(sourceKey(s)));
  saveHcaSources(merged);
  return { added, total: merged.length, sources: merged };
}

export function mergeSourcesFromNewsPayload(newsItems, financialNewsItems, talkingPoints) {
  const existing = loadHcaSources();
  const fromNews = extractSourcesFromNewsItems([
    ...(newsItems || []),
    ...(financialNewsItems || []),
  ]);
  const fromTp = (talkingPoints || [])
    .map((tp) => ({
      name: (tp.source || "").trim(),
      host: hostFromUrl(tp.sourceUrl || tp.url || ""),
      exampleUrl: tp.sourceUrl || tp.url || undefined,
      firstSeen: new Date().toISOString().slice(0, 10),
      lastSeen: new Date().toISOString().slice(0, 10),
    }))
    .filter((s) => s.name || s.host);
  const merged = mergeSources(DEFAULT_OUTLETS, existing.sources, fromNews, fromTp);
  const before = new Set(existing.sources.map(sourceKey));
  const added = merged.filter((s) => !before.has(sourceKey(s)));
  saveHcaSources(merged);
  return { added, total: merged.length, sources: merged };
}

/** Prompt fragment listing every known outlet for the daily Anthropic refresh. */
export function formatSourcesForPrompt(sources) {
  const list = mergeSources(DEFAULT_OUTLETS, sources || []);
  if (list.length === 0) return "";
  const lines = list.map((s) => {
    const host = s.host ? ` (${s.host})` : "";
    const ex = s.exampleUrl ? ` — e.g. ${s.exampleUrl}` : "";
    return `- ${s.name}${host}${ex}`;
  });
  return `LEARNED / PERSISTENT OUTLETS (always check these — grown from articles already on the dashboard and prior refreshes):\n${lines.join("\n")}`;
}
