import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Minus } from "lucide-react";
import type { ComparisonResult, HospitalComparePeer, PeerAverage } from "@shared/types";
import { CHART, individualHospitalColor } from "@shared/chartTheme";
import {
  COMPARISON_MEASURES,
  MEASURE_CATEGORIES,
  MEASURE_GROUPS,
  formatGapValue,
  formatMeasureValue,
  getMeasureDefinition,
  type MeasureDefinition,
  type MeasureCategory,
  type MeasureValueType,
} from "@shared/measures";
import { MeasureHelp } from "@/components/MeasureHelp";

const NATIONAL_KEY = "national";
const STATE_KEY = "state-all";
const COUNTY_KEY = "county-all";
const DEDICATED_PEER_KEYS = new Set([NATIONAL_KEY, STATE_KEY, COUNTY_KEY]);

interface Props {
  comparison: ComparisonResult;
  categoryFilter?: MeasureCategory | "all";
  onCategoryChange?: (category: MeasureCategory | "all") => void;
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

function stateGap(
  value: number | null,
  state: number | null,
  higherIsBetter: boolean,
): number | null {
  if (value === null || state === null) return null;
  return higherIsBetter ? value - state : state - value;
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
  if (delta === null) return <Minus className="h-3.5 w-3.5 text-slate-300" />;
  if (delta > 0.05) return <ArrowUp className="h-3.5 w-3.5" style={{ color: CHART.positive }} />;
  if (delta < -0.05) return <ArrowDown className="h-3.5 w-3.5" style={{ color: CHART.negative }} />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
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
    leftPercent < 12
      ? "left-0 translate-x-0"
      : leftPercent > 88
        ? "right-0 translate-x-0"
        : "left-1/2 -translate-x-1/2";
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
            transform:
              marker.kind === "peer" ? "translateX(-50%) rotate(45deg)" : "translateX(-50%)",
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
        {subtitle && <p className="mt-1 text-[11px] leading-snug text-slate-500">{subtitle}</p>}
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
    <div className="rounded-xl bg-slate-50/80 px-5 py-4 ring-1 ring-slate-200/80">
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
                  ? "Compared hospital"
                  : undefined
            }
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-500">
        <span>
          {formatMeasureValue(min, valueType)} ·{" "}
          {higherIsBetter ? "Lower scores" : "Lower is better"}
        </span>
        <span>
          {higherIsBetter ? "Higher scores" : "Higher is worse"} ·{" "}
          {formatMeasureValue(max, valueType)}
        </span>
      </div>
    </div>
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

  if (national != null && visiblePeerKeys.has(NATIONAL_KEY))
    markers.push({ key: "national", label: "National", value: national, kind: "national" });
  if (state != null && visiblePeerKeys.has(STATE_KEY))
    markers.push({ key: "state", label: "State", value: state, kind: "state" });
  if (county != null && visiblePeerKeys.has(COUNTY_KEY))
    markers.push({ key: "county", label: "County", value: county, kind: "county" });

  for (const peer of visiblePeers) {
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
    markers.push({
      key: "hospital",
      label: comparison.hospital.name,
      value: baseValue,
      kind: "hospital",
    });
  }

  return markers;
}

function shortHospitalName(name: string, max = 14): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

function MeasureRow({
  measure,
  comparison,
  visiblePeers,
  visiblePeerKeys,
  compareHospitals,
  expanded,
  onToggle,
}: {
  measure: MeasureDefinition;
  comparison: ComparisonResult;
  visiblePeers: PeerAverage[];
  visiblePeerKeys: Set<string>;
  compareHospitals: HospitalComparePeer[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const def = getMeasureDefinition(measure.id)!;
  const value =
    comparison.hospitalScores.find((s) => s.measureId === measure.id)?.value ?? null;
  const state = comparison.stateScores[measure.id] ?? null;
  const national = comparison.nationalScores[measure.id] ?? null;
  const gap = stateGap(value, state, def.higherIsBetter);
  const groupLabel = MEASURE_GROUPS.find((g) => g.id === measure.group)?.label;
  const markers = buildMarkers(
    measure.id,
    comparison,
    visiblePeers,
    compareHospitals,
    value,
    visiblePeerKeys,
  );

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50 sm:px-4"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`}
        />
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {groupLabel}
          </p>
          <p className="text-sm font-semibold text-slate-900">{measure.label}</p>
        </div>
        {compareHospitals.length > 0 && (
          <div className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-1 md:flex">
            {compareHospitals.map((ch, i) => (
              <span
                key={ch.groupKey}
                className="inline-flex max-w-[9.5rem] items-baseline gap-1.5 text-xs"
                title={ch.hospital.name}
              >
                <span className="truncate text-slate-500">
                  {shortHospitalName(ch.hospital.name)}
                </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: individualHospitalColor(i) }}
                >
                  {formatMeasureValue(ch.scores[measure.id] ?? null, def.valueType)}
                </span>
              </span>
            ))}
          </div>
        )}
        <div className="w-20 shrink-0 text-right sm:w-28">
          <div
            className="text-base font-bold tabular-nums"
            style={{ color: CHART.baseHospital }}
          >
            {formatMeasureValue(value, def.valueType)}
          </div>
          <div
            className="truncate text-[10px] font-medium tracking-wide text-slate-400"
            title={comparison.hospital.name}
          >
            {shortHospitalName(comparison.hospital.name, 18)}
          </div>
        </div>
        <div
          className={`hidden w-28 shrink-0 items-center justify-end gap-1 text-xs font-semibold sm:flex ${
            gap == null
              ? "text-slate-400"
              : gap > 0.05
                ? "text-emerald-700"
                : gap < -0.05
                  ? "text-rose-700"
                  : "text-slate-500"
          }`}
        >
          {deltaIcon(gap)}
          <span>{formatGapValue(gap, def.valueType)}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-3 py-4 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-slate-500">
              {def.higherIsBetter ? "Higher is better" : "Lower is better"} · Gap shown vs{" "}
              {comparison.hospital.state} average
            </p>
            <p className="text-xs font-medium text-slate-600 sm:hidden">
              Gap vs state: {formatGapValue(gap, def.valueType)}
            </p>
          </div>

          {markers.length > 1 && (
            <ComparisonBar
              markers={markers}
              valueType={def.valueType}
              higherIsBetter={def.higherIsBetter}
              baseHospitalName={comparison.hospital.name}
            />
          )}

          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <span className="line-clamp-2 text-slate-500" title={comparison.hospital.name}>
                {comparison.hospital.name}
              </span>
              <p className="font-bold" style={{ color: CHART.baseHospital }}>
                {formatMeasureValue(value, def.valueType)}
              </p>
            </div>
            {visiblePeerKeys.has(NATIONAL_KEY) && (
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                <span className="text-slate-500">National</span>
                <p className="font-semibold text-slate-900">
                  {formatMeasureValue(national, def.valueType)}
                </p>
              </div>
            )}
            {visiblePeerKeys.has(STATE_KEY) && (
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                <span className="text-slate-500">{comparison.hospital.state}</span>
                <p className="font-semibold text-slate-900">
                  {formatMeasureValue(state, def.valueType)}
                </p>
              </div>
            )}
            {visiblePeerKeys.has(COUNTY_KEY) && (
              <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                <span className="text-slate-500">County</span>
                <p className="font-semibold text-slate-900">
                  {formatMeasureValue(comparison.countyScores[measure.id] ?? null, def.valueType)}
                </p>
              </div>
            )}
            {compareHospitals.map((ch, i) => (
              <div key={ch.groupKey} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                <span className="line-clamp-2 text-slate-500" title={ch.hospital.name}>
                  {ch.hospital.name}
                </span>
                <p className="font-semibold" style={{ color: individualHospitalColor(i) }}>
                  {formatMeasureValue(ch.scores[measure.id] ?? null, def.valueType)}
                </p>
              </div>
            ))}
          </div>

          <MeasureHelp measure={measure} />
        </div>
      )}
    </div>
  );
}

export function ComparisonTable({
  comparison,
  categoryFilter = "all",
  onCategoryChange,
  visiblePeerKeys,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    let measures = [...COMPARISON_MEASURES];
    if (categoryFilter !== "all") {
      measures = measures.filter((m) => m.category === categoryFilter);
    }
    const groupOrder = MEASURE_GROUPS.map((g) => g.id);
    measures.sort((a, b) => {
      const ga = groupOrder.indexOf(a.group);
      const gb = groupOrder.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      return a.label.localeCompare(b.label);
    });
    return measures;
  }, [categoryFilter]);

  const visiblePeers = comparison.peers.filter((p) => visiblePeerKeys.has(p.groupKey));
  const compareHospitals = comparison.compareHospitals ?? [];
  const noDataHospitals = compareHospitals.filter(hasNoReportedData);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCategoryChange?.("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            categoryFilter === "all"
              ? "bg-brand-primary text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All measures
        </button>
        {MEASURE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onCategoryChange?.(cat.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              categoryFilter === cat.id
                ? "bg-brand-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {cat.id === "patient-experience"
              ? "Patient experience"
              : cat.id === "infections"
                ? "Infections"
                : "Readmissions"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Chart key</span>
        <span className="inline-flex max-w-[220px] items-center gap-1.5">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: CHART.baseHospital }}
          />
          <span className="truncate" title={comparison.hospital.name}>
            {comparison.hospital.name}
          </span>
        </span>
        {visiblePeerKeys.has(NATIONAL_KEY) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART.national }} />{" "}
            National
          </span>
        )}
        {visiblePeerKeys.has(STATE_KEY) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART.state }} />{" "}
            State
          </span>
        )}
        {visiblePeerKeys.has(COUNTY_KEY) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART.county }} />{" "}
            County
          </span>
        )}
        {compareHospitals.map((ch, i) => (
          <span key={ch.groupKey} className="inline-flex max-w-[180px] items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: individualHospitalColor(i) }}
            />
            <span className="truncate" title={ch.hospital.name}>
              {ch.hospital.name}
            </span>
          </span>
        ))}
      </div>

      {noDataHospitals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">
            {noDataHospitals.length === 1
              ? `${noDataHospitals[0]!.hospital.name} reports no CMS quality data`
              : "Some compared hospitals report no CMS quality data"}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden items-center gap-3 border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:flex">
          <span className="w-4" />
          <span className="min-w-0 flex-1 basis-[12rem]">Measure</span>
          {compareHospitals.length > 0 && (
            <span className="hidden min-w-0 flex-1 text-right md:block">Compared scores</span>
          )}
          <span
            className="w-20 truncate text-right sm:w-28"
            title={comparison.hospital.name}
          >
            {shortHospitalName(comparison.hospital.name, 18)}
          </span>
          <span className="w-28 text-right">Gap vs state</span>
        </div>
        {rows.map((measure) => (
          <MeasureRow
            key={measure.id}
            measure={measure}
            comparison={comparison}
            visiblePeers={visiblePeers}
            visiblePeerKeys={visiblePeerKeys}
            compareHospitals={compareHospitals}
            expanded={expandedId === measure.id}
            onToggle={() =>
              setExpandedId((id) => (id === measure.id ? null : measure.id))
            }
          />
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No measures in this category.
          </p>
        )}
      </div>
    </div>
  );
}
