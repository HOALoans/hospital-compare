#!/usr/bin/env node
/**
 * Refresh Mission Hospital care-integrity dashboard data from CMS.
 * Usage (from repo root): npm run refresh:mission-tracker
 * Or: node public/mission-tracker/refresh.mjs
 *
 * Updates charts.json (+ mirrors lastRefresh into data.json).
 * Historical series (IJ, staff-to-bed, travelers, HCAHPS star history) are preserved;
 * only current CMS snapshots that change quarterly are overwritten.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CCN = "340002";
const chartsPath = path.join(__dirname, "charts.json");
const dataPath = path.join(__dirname, "data.json");

const q = async (dataset, body) => {
  const res = await fetch(
    `https://data.cms.gov/provider-data/api/1/datastore/query/${dataset}/0`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`${dataset} HTTP ${res.status}`);
  return res.json();
};

const facility = {
  conditions: [{ property: "facility_id", operator: "=", value: CCN }],
  limit: 100,
};

const today = new Date().toISOString().slice(0, 10);
const charts = JSON.parse(fs.readFileSync(chartsPath, "utf8"));
const data = fs.existsSync(dataPath)
  ? JSON.parse(fs.readFileSync(dataPath, "utf8"))
  : {};

console.log(`Mission tracker refresh ${today} (CCN ${CCN})\n`);

// --- HCAHPS ---
const hcahps = await q("dgck-syfz", facility);
const hRows = hcahps.results || [];
const hFind = (id) => hRows.find((r) => r.hcahps_measure_id === id);
const star = Number(hFind("H_STAR_RATING")?.patient_survey_star_rating);
const high = Number(hFind("H_HSP_RATING_9_10")?.hcahps_answer_percent);
const low = Number(hFind("H_HSP_RATING_0_6")?.hcahps_answer_percent);
if (Number.isFinite(star)) {
  // Update latest label in starTrend (ends with * or current year)
  const labels = charts.starTrend.labels;
  const vals = charts.starTrend.mission;
  const last = labels.length - 1;
  vals[last] = star;
  console.log(`HCAHPS summary stars: ${star}`);
}
if (Number.isFinite(high) && Number.isFinite(low)) {
  charts.goodBad = { labels: [today.slice(0, 7)], high: [high], low: [low] };
  console.log(`Good/bad: ${high}% / ${low}%`);
}

// --- Overall hospital rating ---
const gen = await q("xubh-q36u", {
  conditions: [{ property: "facility_id", operator: "=", value: CCN }],
  limit: 5,
});
const g0 = (gen.results || [])[0];
const overall = Number(g0?.hospital_overall_rating);
if (Number.isFinite(overall)) {
  const yr = String(new Date().getFullYear());
  const labels = charts.overallStars?.labels?.length
    ? charts.overallStars.labels.slice()
    : [yr];
  const stars = charts.overallStars?.stars?.length
    ? charts.overallStars.stars.slice()
    : [overall];
  const last = String(labels[labels.length - 1] || "").replace("*", "");
  if (last === yr) stars[stars.length - 1] = overall;
  else {
    labels.push(yr);
    stars.push(overall);
  }
  charts.overallStars = { labels, stars };
  console.log(`Overall CMS stars: ${overall} (${labels.join(", ")})`);
}

// --- HAI SIRs ---
const haiIds = [
  ["HAI_1_SIR", "Central-line bloodstream infection"],
  ["HAI_2_SIR", "Catheter urinary tract infection"],
  ["HAI_3_SIR", "Colon surgery infection"],
  ["HAI_4_SIR", "Hysterectomy surgery infection"],
  ["HAI_5_SIR", "MRSA bloodstream infection"],
  ["HAI_6_SIR", "C. difficile infection"],
];
const hai = await q("77hc-ibv8", facility);
const haiRows = hai.results || [];
const sir = [];
const colors = [];
for (const [mid, label] of haiIds) {
  const r = haiRows.find((x) => x.measure_id === mid);
  const v = r ? Number(r.score) : NaN;
  sir.push(Number.isFinite(v) ? v : null);
  if (!Number.isFinite(v)) colors.push("#94a3b8");
  else if (v > 1.0 && String(r.compared_to_national || "").toLowerCase().includes("worse"))
    colors.push("#dc2626");
  else if (v < 1.0) colors.push("#059669");
  else colors.push("#94a3b8");
  console.log(`HAI ${label}: ${v} (${r?.compared_to_national || "n/a"})`);
}
if (sir.some((v) => v != null)) {
  charts.hai.labels = haiIds.map(([, label]) => label);
  charts.hai.sir = sir;
  charts.hai.colors = colors;
}

// --- Mortality Mission + National ---
const mortIds = [
  ["MORT_30_AMI", "Heart attack"],
  ["MORT_30_CABG", "Heart bypass surgery"],
  ["MORT_30_COPD", "Chronic lung disease (COPD)"],
  ["MORT_30_HF", "Heart failure"],
  ["MORT_30_PN", "Pneumonia"],
  ["MORT_30_STK", "Stroke"],
];
const [mortMis, mortNat] = await Promise.all([
  q("ynj2-r877", facility),
  q("qqw3-t4ie", { limit: 100 }),
]);
const mortMisRows = mortMis.results || [];
const mortNatBy = Object.fromEntries((mortNat.results || []).map((r) => [r.measure_id, r]));
const mLabels = [], mMis = [], mNat = [];
for (const [mid, label] of mortIds) {
  const r = mortMisRows.find((x) => x.measure_id === mid);
  const n = mortNatBy[mid];
  const mv = Number(r?.score);
  const nv = Number(n?.national_rate);
  if (!Number.isFinite(mv) || !Number.isFinite(nv)) continue;
  mLabels.push(label);
  mMis.push(mv);
  mNat.push(nv);
  console.log(`Mort ${label}: ${mv} vs natl ${nv} (${r?.compared_to_national || ""})`);
}
if (mLabels.length) {
  charts.mortality = { labels: mLabels, mission: mMis, national: mNat };
}

// --- Complications key measures ---
const compSpec = [
  ["PSI_90", "Overall patient-safety score"],
  ["PSI_03", "Pressure ulcer"],
  ["PSI_12", "Blood clot after surgery"],
  ["COMP_HIP_KNEE", "Hip/knee surgery complications"],
  ["Hybrid_HWM", "Hospital-wide mortality"],
];
const labels = [], pct = [], status = [], raw = [];
for (const [mid, label] of compSpec) {
  const r = mortMisRows.find((x) => x.measure_id === mid);
  const n = mortNatBy[mid];
  const mv = Number(r?.score);
  const nv = Number(n?.national_rate);
  if (!Number.isFinite(mv) || !Number.isFinite(nv) || nv === 0) continue;
  const vs = r?.compared_to_national || "";
  const st = vs.toLowerCase().includes("better")
    ? "Better"
    : vs.toLowerCase().includes("worse")
      ? "Worse"
      : "Same";
  labels.push(label);
  pct.push(Math.round((mv / nv) * 100));
  status.push(st);
  const pctLike = mid === "Hybrid_HWM";
  raw.push({
    mission: pctLike ? `${mv}%` : String(mv),
    national: pctLike ? `${nv}%` : String(nv),
  });
  console.log(`Comp ${label}: ${mv} / ${nv} → ${pct[pct.length - 1]}% (${st})`);
}
if (labels.length) {
  charts.complications = { labels, pctOfNational: pct, status, raw };
}

// --- Readmissions ---
const readmIds = [
  ["Hybrid_HWR", "All patients"],
  ["READM_30_AMI", "Heart attack"],
  ["READM_30_HF", "Heart failure"],
  ["READM_30_PN", "Pneumonia"],
  ["READM_30_COPD", "Chronic lung disease (COPD)"],
  ["READM_30_CABG", "Heart bypass surgery"],
  ["READM_30_HIP_KNEE", "Hip/knee surgery"],
];const [readMis, readNat] = await Promise.all([
  q("632h-zaca", facility),
  q("cvcs-xecj", { limit: 100 }),
]);
const readMisRows = readMis.results || [];
const readNatBy = Object.fromEntries((readNat.results || []).map((r) => [r.measure_id, r]));
const rLabels = [], rMis = [], rNat = [];
for (const [mid, label] of readmIds) {
  const r = readMisRows.find((x) => x.measure_id === mid);
  const n = readNatBy[mid];
  const mv = Number(r?.score);
  const nv = Number(n?.national_rate);
  if (!Number.isFinite(mv) || !Number.isFinite(nv)) continue;
  rLabels.push(label);
  rMis.push(mv);
  rNat.push(nv);
  console.log(`Readmit ${label}: ${mv} vs natl ${nv}`);
}
if (rLabels.length) {
  charts.readmit = { labels: rLabels, mission: rMis, national: rNat };
}

charts.lastRefresh = today;
data.lastRefresh = today;

fs.writeFileSync(chartsPath, JSON.stringify(charts, null, 2) + "\n");
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
console.log(`\nWrote ${chartsPath}`);
console.log(`Wrote ${dataPath}`);
