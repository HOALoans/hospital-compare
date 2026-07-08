import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ComparisonResult, HospitalComparePeer, PeerAverage } from "@shared/types";
import {
  CHART,
  individualHospitalColor,
} from "@shared/chartTheme";
import {
  COMPARISON_MEASURES,
  MEASURE_GROUPS,
  formatMeasureValue,
  getMeasureDefinition,
  type MeasureDefinition,
  type MeasureGroup,
  type MeasureCategory,
  type MeasureValueType,
} from "@shared/measures";
import { MeasureHelp } from "@/components/MeasureHelp";

type SortKey = "category" | "measure" | "gap-national" | "gap-state" | "gap-county";

// Peer group keys that are already represented by dedicated marker kinds
// (national circle, state circle, county circle). We map each dedicated
// marker to its toggle key so markers react to the peer toggle state and we
// avoid drawing duplicate diamonds for the same value.
const NATIONAL_KEY = "national";
const STATE_KEY = "state-all";
const COUNTY_KEY = "county-all";
const DEDICATED_PEER_KEYS = new Set([NATIONAL_KEY, STATE_KEY, COUNTY_KEY]);

interface Props {
  comparison: ComparisonResult;
  groupFilter: MeasureGroup | "all";
  categoryFilter?: MeasureCategory | "all";
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  visiblePeerKeys: Set<string>;
}

type MarkerKind =
  | "hospital"
  | "national"
  | "state"
  | "county"
  | "peer"
  | "compare-hospital";

interface BarMarker {
  key: string;
  label: string;
  value: number;
  kind: MarkerKind;
  color?: string;
}

function hasNoReportedData(peer: HospitalComparePeer): boolean {
  return COMPARISON_MEASURES.every((m) => peer.scores[m.id] == null);
}

function nationalGap(
  value: number | null,
  national: number | null,
  higherIsBetter: boolean,
): number | null {
  if (value === null || national === null) return null;
  return higherIsBetter ? value - national : national - value;
}

function scaleBounds(values: number[], valueType: MeasureValueType) {
  if (values.length === 0) {
    if (valueType === "star") return { min: 1, max: 5 };
    if (valueType === "sir") return { min: 0, max: 1 };
    return { min: 0, max: 100 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, valueType === "sir" ? 0.05 : 1);
  return {
    min: Math.max(0, min - pad),
    max: max + pad,
  };
}

function toPercent(value: number, min: number, max: number) {
  if (max <= min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function deltaIcon(delta: number | null) {
  if (delta === null) return <Minus className="h-3 w-3 text-slate-300" />;
  if (delta > 0.05) return <ArrowUp className="h-3 w-3" style={{ color: CHART.positive }} />;
  if (delta < -0.05) return <ArrowDown className="h-3 w-3" style={{ color: CHART.negative }} />;
  return <Minus className="h-3 w-3 text-slate-400" />;
}

function GapBadge({ gap, decimals }: { gap: number | null; decimals: number }) {
  if (gap === null) {
    return <span className="text-xs text-slate-400">No national benchmark</span>;
  }
  const tone =
    gap > 0.05
      ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
      : gap < -0.05
        ? "bg-rose-50 text-rose-900 ring-rose-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      {deltaIcon(gap)}
      {gap > 0 ? "+" : ""}
      {Number(gap.toFixed(decimals))} vs national
    </span>
  );
}

function markerColor(marker: BarMarker): string {
  switch (marker.kind) {
    case "hospital":
      return CHART.baseHospital;
    case "national":
      return CHART.national;
    case "state":
      return CHART.state;
    case "county":
      return CHART.county;
    case "peer":
      return CHART.peerGroup;
    case "compare-hospital":
      return marker.color ?? CHART.state;
  }
}

function MarkerTooltip({
  marker,
  valueType,
  leftPercent,
  subtitle,
}: {
  marker: BarMarker;
  valueType: MeasureValueType;
  leftPercent: number;
  subtitle?: string;
}) {
  const color = markerColor(marker);
  const align =
    leftPercent < 12 ? "left-0 translate-x-0" : leftPercent > 88 ? "right-0 translate-x-0" : "left-1/2 -translate-x-1/2";
  const isBase = marker.kind === "hospital";
  const size = isBase ? 22 : marker.kind === "compare-hospital" ? 16 : 12;

  return (
    <div
      className="group/marker absolute bottom-0 z-30 -translate-x-1/2"
      style={{ left: `${leftPercent}%` }}
    >
      <div
        className="mx-auto cursor-help"
        style={{ width: Math.max(size, 28), height: 64 }}
        aria-label={`${marker.label}: ${formatMeasureValue(marker.value, valueType)}`}
      >
        <div className="mx-auto h-full w-px bg-slate-300/80" style={{ marginBottom: -2 }} />
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 border-2 border-white shadow-md"
          style={{
            width: size,
            height: size,
            borderRadius: marker.kind === "peer" ? 2 : "9999px",
            backgroundColor: color,
            transform: marker.kind === "peer" ? "translateX(-50%) rotate(45deg)" : "translateX(-50%)",
          }}
        />
      </div>
      <div
        className={`pointer-events-none absolute bottom-full z-40 mb-1 w-max max-w-[240px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-left opacity-0 shadow-xl transition-opacity duration-150 group-hover/marker:opacity-100 group-focus-within/marker:opacity-100 print:hidden ${align}`}
        role="tooltip"
      >
        <p className="text-xs font-semibold text-slate-900">{marker.label}</p>
        <p className="mt-0.5 text-sm font-bold" style={{ color }}>
          {formatMeasureValue(marker.value, valueType)}
        </p>
        {subtitle && (
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function ComparisonBar({
  markers,
  valueType,
  higherIsBetter,
  baseHospitalName,
}: {
  markers: BarMarker[];
  valueType: MeasureValueType;
  higherIsBetter: boolean;
  baseHospitalName?: string;
}) {
  const values = markers.map((m) => m.value);
  const { min, max } = scaleBounds(values, valueType);
  const hospital = markers.find((m) => m.kind === "hospital");
  const trackGradient = higherIsBetter
    ? `linear-gradient(90deg, ${CHART.trackLow}, ${CHART.trackMid}, ${CHART.trackHigh})`
    : `linear-gradient(90deg, ${CHART.trackHigh}, ${CHART.trackMid}, ${CHART.trackLow})`;

  return (
    <div className="mt-4 rounded-xl bg-slate-50/80 px-5 py-4 ring-1 ring-slate-200/80">
      <div className="relative h-20">
        <div
          className="absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full shadow-inner"
          style={{ background: trackGradient }}
        />
        {hospital && (
          <div
            className="absolute top-1/2 h-7 -translate-y-1/2 rounded-full opacity-90"
            style={{
              left: 0,
              width: `${toPercent(hospital.value, min, max)}%`,
              backgroundColor: CHART.baseHospitalLight,
              boxShadow: `inset 0 0 0 1px ${CHART.baseHospital}40`,
            }}
          />
        )}
        {markers.map((marker) => (
          <MarkerTooltip
            key={marker.key}
            marker={marker}
            valueType={valueType}
            leftPercent={toPercent(marker.value, min, max)}
            subtitle={
              marker.kind === "hospital"
                ? baseHospitalName
                : marker.kind === "compare-hospital"
                  ? "Individual comparison hospital"
                  : undefined
            }
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-600 ring-1 ring-slate-200">
            {formatMeasureValue(min, valueType)}
          </span>
          {valueType === "sir" ? "Lower is better" : "Lower scores"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {valueType === "sir" ? "Higher is worse" : "Higher scores"}
          <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-600 ring-1 ring-slate-200">
            {formatMeasureValue(max, valueType)}
          </span>
        </span>
      </div>
    </div>
  );
}

function BenchmarkChip({
  label,
  value,
  valueType,
  color,
  emptyLabel,
}: {
  label: string;
  value: number | null;
  valueType: MeasureValueType;
  color: string;
  emptyLabel?: string;
}) {
  const isMissing = value == null && !!emptyLabel;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="max-w-[140px] truncate text-slate-500" title={label}>
        {label}
      </span>
      {isMissing ? (
        <span className="font-semibold text-amber-700">{emptyLabel}</span>
      ) : (
        <span className="font-semibold text-slate-900">{formatMeasureValue(value, valueType)}</span>
      )}
    </span>
  );
}

function buildMarkers(
  measureId: string,
  comparison: ComparisonResult,
  visiblePeers: PeerAverage[],
  compareHospitals: HospitalComparePeer[],
  baseValue: number | null,
  visiblePeerKeys: Set<string>,
): BarMarker[] {
  const markers: BarMarker[] = [];
  const national = comparison.nationalScores[measureId];
  const state = comparison.stateScores[measureId];
  const county = comparison.countyScores[measureId];

  // National / State / County markers are gated by their toggle so they
  // disappear when the corresponding group is switched off.
  if (national != null && visiblePeerKeys.has(NATIONAL_KEY))
    markers.push({ key: "national", label: "National", value: national, kind: "national" });
  if (state != null && visiblePeerKeys.has(STATE_KEY))
    markers.push({ key: "state", label: "State", value: state, kind: "state" });
  if (county != null && visiblePeerKeys.has(COUNTY_KEY))
    markers.push({ key: "county", label: "County", value: county, kind: "county" });

  for (const peer of visiblePeers) {
    // Skip peers already drawn as dedicated national/state/county markers.
    if (DEDICATED_PEER_KEYS.has(peer.groupKey)) continue;
    const v = peer.scores[measureId];
    if (v != null) {
      markers.push({ key: peer.groupKey, label: peer.label, value: v, kind: "peer" });
    }
  }

  compareHospitals.forEach((ch, i) => {
    const v = ch.scores[measureId];
    if (v != null) {
      markers.push({
        key: ch.groupKey,
        label: ch.hospital.name,
        value: v,
        kind: "compare-hospital",
        color: individualHospitalColor(i),
      });
    }
  });

  if (baseValue != null) {
    markers.push({ key: "hospital", label: "Your hospital", value: baseValue, kind: "hospital" });
  }

  return markers;
}

function MeasureCard({
  measure,
  comparison,
  visiblePeers,
  visiblePeerKeys,
  compareHospitals,
}: {
  measure: MeasureDefinition;
  comparison: ComparisonResult;
  visiblePeers: PeerAverage[];
  visiblePeerKeys: Set<string>;
  compareHospitals: HospitalComparePeer[];
}) {
  const def = getMeasureDefinition(measure.id)!;
  const value =
    comparison.hospitalScores.find((s) => s.measureId === measure.id)?.value ?? null;
  const national = comparison.nationalScores[measure.id] ?? null;
  const gap = nationalGap(value, national, def.higherIsBetter);
  const gapDecimals = def.valueType === "sir" ? 3 : 1;
  const groupLabel = MEASURE_GROUPS.find((g) => g.id === measure.group)?.label;
  const markers = buildMarkers(
    measure.id,
    comparison,
    visiblePeers,
    compareHospitals,
    value,
    visiblePeerKeys,
  );
  const dedicatedPeers = visiblePeers.filter((p) => !DEDICATED_PEER_KEYS.has(p.groupKey));

  return (
    <article className="comparison-measure-card break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{groupLabel}</p>
          <h4 className="text-sm font-semibold leading-snug text-slate-900">{measure.label}</h4>
          <div className="no-print">
            <MeasureHelp measure={measure} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-none" style={{ color: CHART.baseHospital }}>
            {formatMeasureValue(value, def.valueType)}
          </div>
          <p className="mt-1 text-[11px] font-medium text-slate-500">Your hospital</p>
        </div>
      </div>

      {markers.length > 1 && (
        <ComparisonBar
          markers={markers}
          valueType={def.valueType}
          higherIsBetter={def.higherIsBetter}
          baseHospitalName={comparison.hospital.name}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {visiblePeerKeys.has(NATIONAL_KEY) && (
          <BenchmarkChip label="National" value={national} valueType={def.valueType} color={CHART.national} />
        )}
        {visiblePeerKeys.has(STATE_KEY) && (
          <BenchmarkChip
            label="State"
            value={comparison.stateScores[measure.id] ?? null}
            valueType={def.valueType}
            color={CHART.state}
          />
        )}
        {visiblePeerKeys.has(COUNTY_KEY) && (
          <BenchmarkChip
            label="County"
            value={comparison.countyScores[measure.id] ?? null}
            valueType={def.valueType}
            color={CHART.county}
          />
        )}
        {dedicatedPeers.map((peer) => (
          <BenchmarkChip
            key={peer.groupKey}
            label={peer.label}
            value={peer.scores[measure.id] ?? null}
            valueType={def.valueType}
            color={CHART.peerGroup}
          />
        ))}
        {compareHospitals.map((ch, i) => (
          <BenchmarkChip
            key={ch.groupKey}
            label={ch.hospital.name}
            value={ch.scores[measure.id] ?? null}
            valueType={def.valueType}
            color={individualHospitalColor(i)}
            emptyLabel="No CMS data"
          />
        ))}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <GapBadge gap={gap} decimals={gapDecimals} />
      </div>
    </article>
  );
}

export function ComparisonTable({
  comparison,
  groupFilter,
  categoryFilter = "all",
  sortBy,
  sortDir,
  visiblePeerKeys,
}: Props) {
  const hospitalScores = useMemo(
    () => new Map(comparison.hospitalScores.map((s) => [s.measureId, s.value])),
    [comparison.hospitalScores],
  );

  const rows = useMemo(() => {
    let measures = [...COMPARISON_MEASURES];
    if (categoryFilter !== "all") {
      measures = measures.filter((m) => m.category === categoryFilter);
    }
    if (groupFilter !== "all") measures = measures.filter((m) => m.group === groupFilter);

    const groupOrder = MEASURE_GROUPS.map((g) => g.id);
    measures.sort((a, b) => {
      if (sortBy === "category") {
        const ga = groupOrder.indexOf(a.group);
        const gb = groupOrder.indexOf(b.group);
        if (ga !== gb) return sortDir === "asc" ? ga - gb : gb - ga;
        return sortDir === "asc" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
      }
      if (sortBy === "measure") {
        return sortDir === "asc" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
      }

      const va = hospitalScores.get(a.id);
      const vb = hospitalScores.get(b.id);

      const gapFor = (
        id: string,
        v: number | null | undefined,
        baseline: Record<string, number | null>,
      ) => {
        const measureDef = getMeasureDefinition(id);
        if (v == null || !measureDef) return -Infinity;
        const base = baseline[id] ?? 0;
        return measureDef.higherIsBetter ? v - base : base - v;
      };

      if (sortBy === "gap-national") {
        const da = gapFor(a.id, va, comparison.nationalScores);
        const db = gapFor(b.id, vb, comparison.nationalScores);
        return sortDir === "asc" ? da - db : db - da;
      }
      if (sortBy === "gap-county") {
        const da = gapFor(a.id, va, comparison.countyScores);
        const db = gapFor(b.id, vb, comparison.countyScores);
        return sortDir === "asc" ? da - db : db - da;
      }
      const da = gapFor(a.id, va, comparison.stateScores);
      const db = gapFor(b.id, vb, comparison.stateScores);
      return sortDir === "asc" ? da - db : db - da;
    });

    return measures;
  }, [comparison, groupFilter, categoryFilter, hospitalScores, sortBy, sortDir]);

  const visiblePeers = comparison.peers.filter((p) => visiblePeerKeys.has(p.groupKey));
  const compareHospitals = comparison.compareHospitals ?? [];
  const noDataHospitals = compareHospitals.filter(hasNoReportedData);

  return (
    <div className="space-y-4">
      <div className="chart-legend flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 print:border-slate-300 print:bg-white">
        <span className="font-bold text-slate-900">Chart key</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-4 w-4 rounded-full border-2 border-white shadow" style={{ backgroundColor: CHART.baseHospital }} />
          Your hospital
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART.national }} /> National
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART.state }} /> State
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART.county }} /> County
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45" style={{ backgroundColor: CHART.peerGroup }} /> Group avg
        </span>
        {compareHospitals.map((ch, i) => (
          <span key={ch.groupKey} className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: individualHospitalColor(i) }}
            />
            <span className="max-w-[200px] truncate" title={ch.hospital.name}>
              {ch.hospital.name}
            </span>
            {hasNoReportedData(ch) && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                No CMS data
              </span>
            )}
          </span>
        ))}
      </div>

      {noDataHospitals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 no-print">
          <p className="font-semibold">
            {noDataHospitals.length === 1
              ? `${noDataHospitals[0].hospital.name} reports no CMS quality data`
              : "Some compared hospitals report no CMS quality data"}
          </p>
          <p className="mt-1 leading-relaxed text-amber-800">
            {noDataHospitals.length === 1 ? "It" : "They"} did not report HCAHPS patient-experience,
            healthcare-associated infection, or readmission measures to CMS for this period — often
            the case for specialty, pediatric, or research facilities. That is why{" "}
            {noDataHospitals.length === 1 ? "it does" : "they do"} not appear on the comparison bars
            below.
          </p>
          {noDataHospitals.length > 1 && (
            <ul className="mt-1.5 list-inside list-disc">
              {noDataHospitals.map((ch) => (
                <li key={ch.groupKey}>{ch.hospital.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {rows.map((measure) => (
          <MeasureCard
            key={measure.id}
            measure={measure}
            comparison={comparison}
            visiblePeers={visiblePeers}
            visiblePeerKeys={visiblePeerKeys}
            compareHospitals={compareHospitals}
          />
        ))}
      </div>
    </div>
  );
}
