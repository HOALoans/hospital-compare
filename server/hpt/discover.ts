import fs from "fs";
import path from "path";
import type { HospitalSummary } from "../../shared/types.js";
import { HOSPITAL_DOMAINS, inferHospitalDomain } from "../../shared/hospitalDomains.js";
import { HPT_INDEX_CACHE_FILE } from "../dataPaths.js";
import { bestLocationMatch, nameScore, normalizeName, parseCmsHptTxt, type CmsHptLocation } from "./cmsHptTxt.js";

const INDEX_URL = "https://referencesource.org/hospital-price-transparency-mrf-index/data.json";
const USER_AGENT = "Parigrado/1.0 (hospital price transparency research; https://parigrado.com)";

interface IndexRecord {
  location_name?: string;
  hospital_domain?: string;
  mrf_url?: string;
  source?: string;
}

interface IndexCache {
  fetchedAt: string;
  records: IndexRecord[];
}

let indexCache: IndexCache | null = null;

async function fetchText(url: string, timeoutMs = 25_000): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/plain,application/json,*/*" },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url };
  } finally {
    clearTimeout(t);
  }
}

export async function loadPublicMrfIndex(): Promise<IndexRecord[]> {
  if (indexCache && Date.now() - Date.parse(indexCache.fetchedAt) < 7 * 24 * 60 * 60 * 1000) {
    return indexCache.records;
  }
  try {
    if (fs.existsSync(HPT_INDEX_CACHE_FILE)) {
      const disk = JSON.parse(fs.readFileSync(HPT_INDEX_CACHE_FILE, "utf8")) as IndexCache;
      if (Date.now() - Date.parse(disk.fetchedAt) < 7 * 24 * 60 * 60 * 1000) {
        indexCache = disk;
        return disk.records;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const { ok, text } = await fetchText(INDEX_URL, 60_000);
    if (!ok) return indexCache?.records ?? [];
    const json = JSON.parse(text) as { records?: IndexRecord[] };
    const records = json.records ?? [];
    indexCache = { fetchedAt: new Date().toISOString(), records };
    fs.mkdirSync(path.dirname(HPT_INDEX_CACHE_FILE), { recursive: true });
    fs.writeFileSync(HPT_INDEX_CACHE_FILE, JSON.stringify(indexCache));
    return records;
  } catch (err) {
    console.warn("[hpt] Could not load public MRF index:", err);
    return indexCache?.records ?? [];
  }
}

function domainsFor(hospital: HospitalSummary): string[] {
  const out: string[] = [];
  const curated = HOSPITAL_DOMAINS[hospital.facilityId];
  if (curated) out.push(curated);
  const inferred = inferHospitalDomain(hospital);
  if (inferred) out.push(inferred);
  return [...new Set(out.map((d) => d.replace(/^https?:\/\//, "").replace(/\/$/, "")))];
}

function hptTxtUrls(domain: string): string[] {
  const host = domain.replace(/^www\./, "");
  return [
    `https://${domain}/cms-hpt.txt`,
    `https://www.${host}/cms-hpt.txt`,
    `https://${domain}/.well-known/cms-hpt.txt`,
    `https://www.${host}/.well-known/cms-hpt.txt`,
  ];
}

async function mrfFromHptTxt(url: string, hospitalName: string): Promise<string | null> {
  const { ok, text } = await fetchText(url);
  if (!ok) return null;
  if (/<html/i.test(text.slice(0, 200))) return null;
  const locations = parseCmsHptTxt(text);
  const best = bestLocationMatch(hospitalName, locations);
  return best?.mrfUrl ?? null;
}

function matchIndex(hospital: HospitalSummary, records: IndexRecord[]): IndexRecord | null {
  const n = normalizeName(hospital.name);
  let best: IndexRecord | null = null;
  let bestScore = 0;
  for (const rec of records) {
    const score = nameScore(n, normalizeName(rec.location_name ?? ""));
    if (score > bestScore) {
      bestScore = score;
      best = rec;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

export async function discoverMrfUrl(hospital: HospitalSummary): Promise<{ mrfUrl: string; via: string } | null> {
  const records = await loadPublicMrfIndex();
  const idx = matchIndex(hospital, records);
  if (idx?.mrf_url) {
    if (idx.source) {
      const fromTxt = await mrfFromHptTxt(idx.source, hospital.name);
      if (fromTxt) return { mrfUrl: fromTxt, via: "cms-hpt.txt (index)" };
    }
    return { mrfUrl: idx.mrf_url, via: "public MRF index" };
  }

  const extraDomains: string[] = [];
  if (idx?.hospital_domain) extraDomains.push(idx.hospital_domain);
  if (idx?.source) {
    try {
      extraDomains.push(new URL(idx.source).hostname);
    } catch {
      /* ignore */
    }
  }

  const domains = [...new Set([...domainsFor(hospital), ...extraDomains])];
  for (const domain of domains) {
    for (const url of hptTxtUrls(domain)) {
      try {
        const mrf = await mrfFromHptTxt(url, hospital.name);
        if (mrf) return { mrfUrl: mrf, via: url };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

export type { CmsHptLocation };
