import type { HospitalSummary } from "../../shared/types.js";
import type {
  HptCodeRow,
  HptCodeTrend,
  HptCompareResponse,
  HptDistribution,
  HptHospitalValue,
  HptMetric,
  HptPayer,
} from "../../shared/hpt.js";
import { HPT_MAX_CODES } from "../../shared/hpt.js";
import { getHospitalById } from "../cache.js";
import { getCodeShard, getCoverage, hospitalHasSnapshot, latestPoint } from "./store.js";
import { empiricalPercentile, quartileOf, summarize } from "./stats.js";
import { ensureHospitalCrawled, prioritizeHospitals } from "./crawl.js";

function pickValue(
  cash: number | null,
  allMean: number | null,
  allMedian: number | null,
  metric: HptMetric,
  payer: HptPayer,
): number | null {
  if (payer === "cash") return cash;
  return metric === "mean" ? allMean : allMedian;
}

function buildHospitalValue(
  hospital: HospitalSummary,
  value: number | null,
  distValues: number[],
  dist: HptDistribution,
): HptHospitalValue {
  if (value == null) {
    return {
      facilityId: hospital.facilityId,
      name: hospital.name,
      value: null,
      quartile: null,
      percentile: null,
      top1Percent: false,
    };
  }
  const sorted = [...distValues].sort((a, b) => a - b);
  const pct = empiricalPercentile(sorted, value);
  return {
    facilityId: hospital.facilityId,
    name: hospital.name,
    value,
    quartile: quartileOf(value, dist.p25, dist.median, dist.p75),
    percentile: pct,
    top1Percent: dist.p99 != null && value >= dist.p99,
  };
}

function normalizeCodes(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const code = c.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= HPT_MAX_CODES) break;
  }
  return out;
}

export async function buildHptComparison(opts: {
  facilityId: string;
  codes: string[];
  compareWith?: string[];
  metric: HptMetric;
  payer: HptPayer;
}): Promise<HptCompareResponse | null> {
  const hospital = getHospitalById(opts.facilityId);
  if (!hospital) return null;
  const codes = normalizeCodes(opts.codes);
  const compareIds = (opts.compareWith ?? []).filter((id) => id && id !== hospital.facilityId).slice(0, 8);

  prioritizeHospitals([hospital.facilityId, ...compareIds]);
  const pendingHospital = !(await ensureHospitalCrawled(hospital));

  const rows: HptCodeRow[] = [];
  const trends: HptCodeTrend[] = [];
  let snapshotDate: string | null = null;

  for (const code of codes) {
    const shard = getCodeShard(code);
    const nationalVals: number[] = [];
    const zipVals: number[] = [];
    const latestByFacility = new Map<string, ReturnType<typeof latestPoint>>();

    for (const [fid, points] of Object.entries(shard.byFacility)) {
      const latest = latestPoint(points);
      if (!latest) continue;
      latestByFacility.set(fid, latest);
      if (!snapshotDate || latest.date > snapshotDate) snapshotDate = latest.date;
      const v = pickValue(latest.cash, latest.allMean, latest.allMedian, opts.metric, opts.payer);
      if (v == null) continue;
      nationalVals.push(v);
      if (latest.zip3 && latest.zip3 === hospital.zip3) zipVals.push(v);
    }

    const national = summarize(nationalVals);
    const zip3 = summarize(zipVals);
    const selfLatest = latestByFacility.get(hospital.facilityId);
    const selfVal = selfLatest
      ? pickValue(selfLatest.cash, selfLatest.allMean, selfLatest.allMedian, opts.metric, opts.payer)
      : null;

    const compareHospitals = compareIds
      .map((id) => getHospitalById(id))
      .filter((h): h is HospitalSummary => h != null)
      .map((h) => {
        const pt = latestByFacility.get(h.facilityId);
        const val = pt ? pickValue(pt.cash, pt.allMean, pt.allMedian, opts.metric, opts.payer) : null;
        return buildHospitalValue(h, val, nationalVals, national);
      });

    rows.push({
      code,
      description: shard.description,
      hospital: buildHospitalValue(hospital, selfVal, nationalVals, national),
      compare: compareHospitals,
      national,
      zip3,
      zip3Label: hospital.zip3 ? `ZIP ${hospital.zip3}xx` : "ZIP3",
    });

    const dateSet = new Set<string>();
    for (const pts of Object.values(shard.byFacility)) {
      for (const p of pts) dateSet.add(p.date);
    }
    const dates = [...dateSet].sort();
    const points = dates.map((date) => {
      const nat: number[] = [];
      const z: number[] = [];
      let hospitalVal: number | null = null;
      for (const [fid, pts] of Object.entries(shard.byFacility)) {
        const pt = pts.find((p) => p.date === date) ?? null;
        if (!pt) continue;
        const v = pickValue(pt.cash, pt.allMean, pt.allMedian, opts.metric, opts.payer);
        if (v == null) continue;
        nat.push(v);
        if (pt.zip3 === hospital.zip3) z.push(v);
        if (fid === hospital.facilityId) hospitalVal = v;
      }
      return {
        date,
        hospital: hospitalVal,
        national: opts.metric === "mean" ? summarize(nat).mean : summarize(nat).median,
        zip3: opts.metric === "mean" ? summarize(z).mean : summarize(z).median,
      };
    });
    trends.push({ code, description: shard.description, points });
  }

  const coverage = getCoverage();
  const note = pendingHospital
    ? "This hospital has not been crawled yet. It is queued; national/ZIP percentiles use hospitals already ingested."
    : coverage.crawledOk < 50
      ? "National crawl is just getting started. Quartiles and the top-1% flag will stabilize as more hospitals are ingested."
      : `Percentiles use ${coverage.crawledOk.toLocaleString()} crawled hospitals (cash vs negotiated rates from CMS hospital MRFs).`;

  return {
    hospital: {
      facilityId: hospital.facilityId,
      name: hospital.name,
      city: hospital.city,
      state: hospital.state,
      zip3: hospital.zip3,
    },
    metric: opts.metric,
    payer: opts.payer,
    snapshotDate,
    pendingHospital,
    coverage,
    rows,
    trends,
    note,
  };
}

export { hospitalHasSnapshot };
