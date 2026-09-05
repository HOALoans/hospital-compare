import type { HospitalSummary } from "../../shared/types.js";
import type {
  HptCodeRow,
  HptCodeTrend,
  HptCompareResponse,
  HptHospitalValue,
  HptMetric,
  HptPayer,
} from "../../shared/hpt.js";
import { HPT_MAX_CODES } from "../../shared/hpt.js";
import { getHospitalById } from "../cache.js";
import { getCodeShard, getCoverage, hospitalHasSnapshot, latestPoint } from "./store.js";
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

function hospitalValue(hospital: HospitalSummary, value: number | null): HptHospitalValue {
  return {
    facilityId: hospital.facilityId,
    name: hospital.name,
    value,
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

  const crawl = await ensureHospitalCrawled(hospital, codes);
  prioritizeHospitals(compareIds, codes);
  const pendingHospital = !crawl.ready && !crawl.error;
  const pendingCompareIds = compareIds.filter((id) => !hospitalHasSnapshot(id));

  const rows: HptCodeRow[] = [];
  const trends: HptCodeTrend[] = [];
  let snapshotDate: string | null = null;

  const trackedIds = new Set([hospital.facilityId, ...compareIds]);

  for (const code of codes) {
    const shard = getCodeShard(code);
    const latestByFacility = new Map<string, ReturnType<typeof latestPoint>>();

    for (const fid of trackedIds) {
      const latest = latestPoint(shard.byFacility[fid]);
      if (!latest) continue;
      latestByFacility.set(fid, latest);
      if (!snapshotDate || latest.date > snapshotDate) snapshotDate = latest.date;
    }

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
        return hospitalValue(h, val);
      });

    rows.push({
      code,
      description: shard.description,
      hospital: hospitalValue(hospital, selfVal),
      compare: compareHospitals,
    });

    const dateSet = new Set<string>();
    for (const fid of trackedIds) {
      for (const p of shard.byFacility[fid] ?? []) dateSet.add(p.date);
    }
    const dates = [...dateSet].sort();
    const points = dates.map((date) => {
      const series: Record<string, number | null> = {};
      for (const fid of trackedIds) {
        const pt = (shard.byFacility[fid] ?? []).find((p) => p.date === date) ?? null;
        series[fid] = pt
          ? pickValue(pt.cash, pt.allMean, pt.allMedian, opts.metric, opts.payer)
          : null;
      }
      return { date, byFacility: series };
    });
    trends.push({ code, description: shard.description, points });
  }

  const coverage = getCoverage();
  const note = crawl.error
    ? `Could not load this hospital's price file: ${crawl.error}`
    : pendingHospital
      ? "Still downloading this hospital's CMS price file. This page will refresh automatically."
      : pendingCompareIds.length > 0
        ? `Downloading ${pendingCompareIds.length} comparison hospital price file(s). Columns fill in automatically.`
        : `Comparing ${1 + compareIds.length} loaded hospital${1 + compareIds.length === 1 ? "" : "s"} from CMS price files.`;

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
    pendingCompareIds,
    crawlError: crawl.error ?? null,
    coverage,
    rows,
    trends,
    note,
  };
}

export { hospitalHasSnapshot };
