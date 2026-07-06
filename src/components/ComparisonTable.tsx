import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ComparisonResult, PeerAverage } from "@shared/types";
import {
  COMPARISON_MEASURES,
  MEASURE_GROUPS,
  formatMeasureValue,
  getMeasureDefinition,
  type MeasureDefinition,
  type MeasureGroup,
  type MeasureValueType,
} from "@shared/measures";

type SortKey = "category" | "measure" | "gap-national" | "gap-state" | "gap-county";

interface Props {
  comparison: ComparisonResult;
  groupFilter: MeasureGroup | "all";
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  visiblePeerKeys: Set<string>;
}

interface BarMarker {
  key: string;
  label: string;
  value: number;
  kind: "hospital" | "national" | "state" | "county" | "peer";
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
  const pad = Math.max((max - min) * 0.12, valueType === "sir" ? 0.05 : 1);
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
  if (delta > 0.05) return <ArrowUp className="h-3 w-3 text-emerald-600" />;
  if (delta < -0.05) return <ArrowDown className="h-3 w-3 text-rose-600" />;
  return <Minus className="h-3 w-3 text-slate-400" />;
}

function GapBadge({
  gap,
  decimals,
}: {
  gap: number | null;
  decimals: number;
}) {
  if (gap === null) {
    return <span className="text-xs text-slate-400">No national benchmark</span>;
  }

  const tone =
    gap > 0.05 ? "bg-emerald-50 text-emerald-800" : gap < -0.05 ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {deltaIcon(gap)}
      {gap > 0 ? "+" : ""}
      {Number(gap.toFixed(decimals))} vs national
    </span>
  );
}

function markerStyles(kind: BarMarker["kind"]) {
  switch (kind) {
    case "hospital":
      return "h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-teal-600 shadow-sm z-20";
    case "national":
      return "h-3 w-0.5 -translate-x-1/2 bg-slate-400 z-10";
    case "state":
      return "h-3 w-0.5 -translate-x-1/2 bg-sky-500 z-10";
    case "county":
      return "h-3 w-0.5 -translate-x-1/2 bg-violet-500 z-10";
    case "peer":
      return "h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-white bg-amber-500 z-10";
  }
}

function ComparisonBar({
  markers,
  valueType,
  higherIsBetter,
}: {
  markers: BarMarker[];
  valueType: MeasureValueType;
  higherIsBetter: boolean;
}) {
  const values = markers.map((m) => m.value);
  const { min, max } = scaleBounds(values, valueType);
  const hospital = markers.find((m) => m.kind === "hospital");

  return (
    <div className="mt-3">
      <div className="relative h-7">
        <div
          className={`absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full ${
            higherIsBetter
              ? "bg-gradient-to-r from-rose-100 via-amber-50 to-emerald-100"
              : "bg-gradient-to-r from-emerald-100 via-amber-50 to-rose-100"
          }`}
        />
        {hospital && (
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-teal-200/80"
            style={{
              left: 0,
              width: `${toPercent(hospital.value, min, max)}%`,
            }}
          />
        )}
        {markers.map((marker) => (
          <div
            key={marker.key}
            className={`absolute top-1/2 -translate-y-1/2 ${markerStyles(marker.kind)}`}
            style={{ left: `${toPercent(marker.value, min, max)}%` }}
            title={`${marker.label}: ${formatMeasureValue(marker.value, valueType)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{valueType === "sir" ? "Lower is better" : "Lower"}</span>
        <span>{valueType === "sir" ? "Higher is worse" : "Higher"}</span>
      </div>
    </div>
  );
}

function BenchmarkChip({
  label,
  value,
  valueType,
  accent,
}: {
  label: string;
  value: number | null;
  valueType: MeasureValueType;
  accent: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${accent}`} />
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{formatMeasureValue(value, valueType)}</span>
    </span>
  );
}

function MeasureCard({
  measure,
  comparison,
  visiblePeers,
}: {
  measure: MeasureDefinition;
  comparison: ComparisonResult;
  visiblePeers: PeerAverage[];
}) {
  const def = getMeasureDefinition(measure.id)!;
  const value =
    comparison.hospitalScores.find((s) => s.measureId === measure.id)?.value ?? null;
  const national = comparison.nationalScores[measure.id] ?? null;
  const state = comparison.stateScores[measure.id] ?? null;
  const county = comparison.countyScores[measure.id] ?? null;
  const gap = nationalGap(value, national, def.higherIsBetter);
  const gapDecimals = def.valueType === "sir" ? 3 : 1;
  const groupLabel = MEASURE_GROUPS.find((g) => g.id === measure.group)?.label;

  const markers: BarMarker[] = [];
  if (national !== null) {
    markers.push({ key: "national", label: "National", value: national, kind: "national" });
  }
  if (state !== null) {
    markers.push({ key: "state", label: "State", value: state, kind: "state" });
  }
  if (county !== null) {
    markers.push({ key: "county", label: "County", value: county, kind: "county" });
  }
  for (const peer of visiblePeers) {
    const peerValue = peer.scores[measure.id];
    if (peerValue != null) {
      markers.push({
        key: peer.groupKey,
        label: peer.label,
        value: peerValue,
        kind: "peer",
      });
    }
  }
  if (value !== null) {
    markers.push({ key: "hospital", label: "Your hospital", value, kind: "hospital" });
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
            {groupLabel}
          </p>
          <h4 className="text-sm font-semibold leading-snug text-slate-900">{measure.label}</h4>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold leading-none text-teal-800">
            {formatMeasureValue(value, def.valueType)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Your hospital</p>
        </div>
      </div>

      {markers.length > 1 && (
        <ComparisonBar
          markers={markers}
          valueType={def.valueType}
          higherIsBetter={def.higherIsBetter}
        />
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <BenchmarkChip label="National" value={national} valueType={def.valueType} accent="bg-slate-400" />
        <BenchmarkChip label="State" value={state} valueType={def.valueType} accent="bg-sky-500" />
        <BenchmarkChip label="County" value={county} valueType={def.valueType} accent="bg-violet-500" />
        {visiblePeers.map((peer) => (
          <BenchmarkChip
            key={peer.groupKey}
            label={peer.label}
            value={peer.scores[measure.id] ?? null}
            valueType={def.valueType}
            accent="bg-amber-500"
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
  }, [comparison, groupFilter, hospitalScores, sortBy, sortDir]);

  const visiblePeers = comparison.peers.filter((p) => visiblePeerKeys.has(p.groupKey));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Chart key</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-teal-600" /> Your hospital
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-slate-400" /> National
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-sky-500" /> State
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-violet-500" /> County
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-amber-500" /> Compare group
        </span>
        <span className="text-slate-500">Bar color runs worse → better for each measure.</span>
      </div>

      <div className="grid gap-3">
        {rows.map((measure) => (
          <MeasureCard
            key={measure.id}
            measure={measure}
            comparison={comparison}
            visiblePeers={visiblePeers}
          />
        ))}
      </div>
    </div>
  );
}
