import {
  COMPARISON_MEASURES,
  getMeasureDefinition,
  type MeasureGroup,
} from "../shared/measures.js";
import { OWNERSHIP_LABELS, type OwnershipGroup } from "../shared/ownership.js";
import type {
  ComparisonResult,
  HospitalComparePeer,
  MeasureScore,
  PeerAverage,
} from "../shared/types.js";
import {
  countHospitalsInPeer,
  getCurrentPeriod,
  getFacilityScores,
  getHospitalById,
  getNationalBenchmark,
  getPeerAverage,
  peerKeyCounty,
  peerKeyState,
  peerKeyZip3,
} from "./cache.js";

function scoresRecord(facilityId: string): Record<string, number | null> {
  const rows = buildHospitalScores(facilityId);
  return Object.fromEntries(rows.map((r) => [r.measureId, r.value]));
}

function buildHospitalScores(facilityId: string): MeasureScore[] {
  const rows = getFacilityScores(facilityId);
  const byMeasure = new Map(rows.map((r) => [r.measureId, r]));

  return COMPARISON_MEASURES.map((def) => {
    const row = byMeasure.get(def.id);
    return {
      measureId: def.id,
      value: row?.value ?? null,
      valueType: def.valueType,
      periodStart: row?.periodStart ?? getCurrentPeriod().start,
      periodEnd: row?.periodEnd ?? getCurrentPeriod().end,
    };
  });
}

function peerScores(peerKey: string): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (const def of COMPARISON_MEASURES) {
    scores[def.id] = getPeerAverage(peerKey, def.id).value;
  }
  return scores;
}

function makePeer(
  label: string,
  groupKey: string,
  peerKey: string,
): PeerAverage {
  return {
    label,
    groupKey,
    hospitalCount: countHospitalsInPeer(peerKey),
    scores: peerScores(peerKey),
  };
}

function ownershipPeer(
  hospital: { state: string; county: string; zip3: string },
  scope: "state" | "county" | "zip3",
  ownershipGroup: OwnershipGroup | "all",
  groupKey: string,
): PeerAverage {
  const og = ownershipGroup;
  const ogLabel = og === "all" ? "all hospitals" : OWNERSHIP_LABELS[og];

  if (scope === "state") {
    const key = peerKeyState(hospital.state, og);
    return makePeer(`${hospital.state} — ${ogLabel}`, groupKey, key);
  }
  if (scope === "county") {
    const key = peerKeyCounty(hospital.state, hospital.county, og);
    return makePeer(
      `${hospital.county} County, ${hospital.state} — ${ogLabel}`,
      groupKey,
      key,
    );
  }
  const key = peerKeyZip3(hospital.zip3, og);
  return makePeer(`ZIP ${hospital.zip3}xx — ${ogLabel}`, groupKey, key);
}

export function buildComparison(
  facilityId: string,
  compareWithIds: string[] = [],
): ComparisonResult | null {
  const hospital = getHospitalById(facilityId);
  if (!hospital) return null;

  const compareHospitals: HospitalComparePeer[] = compareWithIds
    .slice(0, 10)
    .filter((id) => id !== facilityId)
    .map((id) => getHospitalById(id))
    .filter((h): h is NonNullable<typeof h> => h != null)
    .map((h) => ({
      hospital: h,
      groupKey: `hospital-${h.facilityId}`,
      scores: scoresRecord(h.facilityId),
    }));

  const hospitalScores = buildHospitalScores(facilityId);
  const stateAllScores = peerScores(peerKeyState(hospital.state, "all"));
  const countyAllScores = peerScores(peerKeyCounty(hospital.state, hospital.county, "all"));

  const nationalComputed: Record<string, number | null> = {};
  for (const def of COMPARISON_MEASURES) {
    nationalComputed[def.id] = getNationalBenchmark(def.id);
  }

  const peers: PeerAverage[] = [
    ownershipPeer(hospital, "county", "all", "county-all"),
    ownershipPeer(hospital, "county", "for-profit", "county-for-profit"),
    ownershipPeer(hospital, "county", "non-profit", "county-non-profit"),
    ownershipPeer(hospital, "zip3", "all", "zip3-all"),
    ownershipPeer(hospital, "state", "all", "state-all"),
    ownershipPeer(hospital, "state", "for-profit", "state-for-profit"),
    ownershipPeer(hospital, "state", "non-profit", "state-non-profit"),
    ownershipPeer(hospital, "state", "government", "state-government"),
    makePeer("National average (all hospitals)", "national", "national"),
  ];
  peers[peers.length - 1] = {
    label: "National average (all hospitals)",
    groupKey: "national",
    hospitalCount: 0,
    scores: nationalComputed,
  };

  return {
    hospital,
    period: getCurrentPeriod(),
    hospitalScores,
    peers,
    compareHospitals,
    nationalScores: nationalComputed,
    stateScores: stateAllScores,
    countyScores: countyAllScores,
  };
}

const MEASURE_GROUP_ORDER: MeasureGroup[] = [
  "overall",
  "communication",
  "responsiveness",
  "environment",
  "discharge",
  "recommendation",
  "safety",
  "readmissions",
];

export function sortComparisonRows(
  comparison: ComparisonResult,
  sortBy: "category" | "measure" | "gap-national" | "gap-state",
  groupFilter?: MeasureGroup,
  direction: "asc" | "desc" = "desc",
) {
  let measures = [...COMPARISON_MEASURES];
  if (groupFilter) measures = measures.filter((m) => m.group === groupFilter);

  const hospitalByMeasure = new Map(
    comparison.hospitalScores.map((s) => [s.measureId, s.value]),
  );

  const sorted = measures.sort((a, b) => {
    if (sortBy === "category") {
      const ga = MEASURE_GROUP_ORDER.indexOf(a.group);
      const gb = MEASURE_GROUP_ORDER.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      return a.label.localeCompare(b.label);
    }
    if (sortBy === "measure") return a.label.localeCompare(b.label);

    const va = hospitalByMeasure.get(a.id);
    const vb = hospitalByMeasure.get(b.id);

    if (sortBy === "gap-national") {
      const defA = getMeasureDefinition(a.id);
      const defB = getMeasureDefinition(b.id);
      const na =
        va != null
          ? defA?.higherIsBetter
            ? va - (comparison.nationalScores[a.id] ?? 0)
            : (comparison.nationalScores[a.id] ?? 0) - va
          : -Infinity;
      const nb =
        vb != null
          ? defB?.higherIsBetter
            ? vb - (comparison.nationalScores[b.id] ?? 0)
            : (comparison.nationalScores[b.id] ?? 0) - vb
          : -Infinity;
      return na - nb;
    }

    const sa = va != null ? va - (comparison.stateScores[a.id] ?? 0) : -Infinity;
    const sb = vb != null ? vb - (comparison.stateScores[b.id] ?? 0) : -Infinity;
    return sa - sb;
  });

  if (direction === "desc") sorted.reverse();
  return sorted;
}
