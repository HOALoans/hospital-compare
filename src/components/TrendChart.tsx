import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { HospitalComparePeer, HospitalTrend } from "@shared/types";
import {
  COMPARISON_MEASURES,
  formatMeasureValue,
  type MeasureValueType,
} from "@shared/measures";
import { CHART, individualHospitalColor } from "@shared/chartTheme";

import { TrendEmptyState } from "@/components/TrendEmptyState";

type YAxisMode = "full" | "fit" | "from50" | "from75";

interface Props {
  trend: HospitalTrend;
  compareTrends?: HospitalTrend[];
  compareHospitals?: HospitalComparePeer[];
  baseHospitalName: string;
  selectedMeasureId: string;
  facilityId: string;
  maxYears: number;
}

function collectNumericValues(
  data: Record<string, number | string | null>[],
  seriesIds: string[],
  rawSuffix: string,
): number[] {
  const values: number[] = [];
  for (const row of data) {
    for (const id of seriesIds) {
      const v = row[`${id}${rawSuffix}`];
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
  }
  return values;
}

function yDomain(
  mode: YAxisMode,
  valueType: MeasureValueType,
  values: number[],
): [number | "auto", number | "auto"] {
  if (valueType === "star") {
    if (mode === "fit" && values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      return [Math.max(0, Math.floor(min - 0.5)), Math.min(5, Math.ceil(max + 0.5))];
    }
    return [0, 5];
  }

  if (valueType === "sir") {
    if (mode === "fit" && values.length > 0) {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const pad = Math.max((max - min) * 0.15, 0.05);
      return [Math.max(0, min - pad), max + pad];
    }
    return [0, "auto"];
  }

  if (mode === "from75") return [75, 100];
  if (mode === "from50") return [50, 100];
  if (mode === "fit" && values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.15, 1);
    const lo = Math.max(0, Math.floor(min - pad));
    const hi = Math.min(100, Math.ceil(max + pad));
    if (hi <= lo) return [Math.max(0, lo - 1), Math.min(100, lo + 1)];
    return [lo, hi];
  }
  return [0, 100];
}

function fullAxisLabel(valueType: MeasureValueType): string {
  if (valueType === "star") return "Full (0–5)";
  if (valueType === "sir") return "Full (from 0)";
  return "Full (0–100)";
}

interface Series {
  id: string;
  name: string;
  color: string;
  trend?: HospitalTrend;
}

const RAW = "__raw";
const PAD = "__pad";

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string;
  color?: string;
  payload?: Record<string, number | string | null>;
};

function TrendTooltip({
  active,
  payload,
  label,
  valueType,
  seriesById,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  valueType: MeasureValueType;
  seriesById: Map<string, Series>;
}) {
  if (!active || !payload?.length) return null;

  // Prefer the visible (non-pad) bar under the cursor
  const item =
    payload.find((p) => {
      const key = String(p.dataKey ?? "");
      return key && !key.endsWith(PAD) && !key.endsWith(RAW);
    }) ?? payload[0];
  if (!item) return null;

  const dataKey = String(item.dataKey ?? "").replace(PAD, "").replace(RAW, "");
  const series = seriesById.get(dataKey);
  const hospitalName = series?.name ?? String(item.name ?? dataKey);
  const color = series?.color ?? item.color ?? "#64748b";
  const raw = item.payload?.[`${dataKey}${RAW}`];
  if (typeof raw !== "number") return null;

  return (
    <div className="max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <p className="text-xs font-medium text-slate-500">Year {label}</p>
      <div className="mt-1.5 flex items-start gap-2">
        <span
          className="mt-1.5 h-3 w-3 shrink-0 rounded-sm"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-slate-900">{hospitalName}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-slate-800">
            {formatMeasureValue(raw, valueType)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TrendChart({
  trend,
  compareTrends = [],
  compareHospitals = [],
  baseHospitalName,
  selectedMeasureId,
  facilityId,
  maxYears,
}: Props) {
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("fit");
  const measure = COMPARISON_MEASURES.find((m) => m.id === selectedMeasureId);

  const series: Series[] = useMemo(() => {
    const byFacility = new Map(compareTrends.map((t) => [t.facilityId, t]));
    const base: Series = {
      id: facilityId,
      name: baseHospitalName,
      color: CHART.baseHospital,
      trend,
    };
    const others: Series[] = compareHospitals.map((ch, i) => ({
      id: ch.hospital.facilityId,
      name: ch.hospital.name,
      color: individualHospitalColor(i),
      trend: byFacility.get(ch.hospital.facilityId),
    }));
    return [base, ...others];
  }, [trend, compareTrends, compareHospitals, baseHospitalName, facilityId]);

  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);

  // First pass: raw scores by year (needed to compute domain before stacking).
  // Use string year keys so the X-axis is categorical — a numeric axis collapses
  // sparse years (e.g. 2018 + 2025) into two distant ticks with empty space.
  const rawByYear = useMemo(() => {
    const yearSet = new Set<number>();
    for (const s of series) {
      for (const p of s.trend?.points ?? []) {
        if (p.scores[selectedMeasureId] != null) yearSet.add(p.year);
      }
    }
    const years = Array.from(yearSet).sort((a, b) => a - b);
    const recent = years.slice(-Math.max(1, maxYears));
    return recent.map((year) => {
      const row: Record<string, number | string | null> = { year: String(year) };
      for (const s of series) {
        const pt = s.trend?.points.find((p) => p.year === year);
        const score = pt?.scores[selectedMeasureId];
        row[`${s.id}${RAW}`] = score == null ? null : score;
      }
      return row;
    });
  }, [series, selectedMeasureId, maxYears]);

  const values = useMemo(
    () => collectNumericValues(rawByYear, series.map((s) => s.id), RAW),
    [rawByYear, series],
  );

  const showZoomPresets =
    measure?.valueType === "linear" || measure?.valueType === "percent";

  useEffect(() => {
    if (!showZoomPresets && (yAxisMode === "from50" || yAxisMode === "from75")) {
      setYAxisMode("fit");
    }
  }, [showZoomPresets, yAxisMode]);

  const domain = useMemo(
    () =>
      measure
        ? yDomain(yAxisMode, measure.valueType, values)
        : ([0, 100] as [number, number]),
    [yAxisMode, measure, values],
  );

  const axisMin = typeof domain[0] === "number" ? domain[0] : 0;

  // Stack a transparent pad from 0→axisMin so bars render correctly when zoomed
  const data = useMemo(() => {
    return rawByYear.map((rawRow) => {
      const row: Record<string, number | string | null> = { year: rawRow.year };
      for (const s of series) {
        const score = rawRow[`${s.id}${RAW}`];
        row[`${s.id}${RAW}`] = score;
        if (typeof score === "number") {
          row[`${s.id}${PAD}`] = axisMin;
          row[s.id] = Math.max(0, score - axisMin);
        } else {
          row[`${s.id}${PAD}`] = null;
          row[s.id] = null;
        }
      }
      return row;
    });
  }, [rawByYear, series, axisMin]);

  const noTrendHospitals = useMemo(
    () =>
      series
        .filter((s) => s.id !== facilityId)
        .filter((s) => !s.trend?.points.some((p) => p.scores[selectedMeasureId] != null)),
    [series, facilityId, selectedMeasureId],
  );

  const missingNote = noTrendHospitals.length > 0 && (
    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span className="font-semibold">No historical CMS data for this measure:</span>{" "}
      {noTrendHospitals.map((s) => s.name).join(", ")}. These hospitals have no bars
      because they did not report this measure to CMS.
    </p>
  );

  if (!trend.points.length || !measure) {
    return <TrendEmptyState facilityId={facilityId} hasTrendData={false} />;
  }

  if (data.length === 0) {
    return (
      <div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
          No historical values available for this measure in the selected range.
        </div>
        {missingNote}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Y-axis
          <select
            value={yAxisMode}
            onChange={(e) => setYAxisMode(e.target.value as YAxisMode)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="fit">Fit to scores</option>
            <option value="full">{fullAxisLabel(measure.valueType)}</option>
            {showZoomPresets && (
              <>
                <option value="from50">Zoom from 50</option>
                <option value="from75">Zoom from 75</option>
              </>
            )}
          </select>
        </label>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="year"
              type="category"
              tick={{ fontSize: 12 }}
              interval={0}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis domain={domain} tick={{ fontSize: 12 }} allowDataOverflow />
            <Tooltip
              shared={false}
              cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
              content={(props) => (
                <TrendTooltip
                  active={props.active}
                  payload={props.payload as TooltipPayloadItem[] | undefined}
                  label={props.label as string | number | undefined}
                  valueType={measure.valueType}
                  seriesById={seriesById}
                />
              )}
            />
            <Legend
              wrapperStyle={{ paddingTop: 12 }}
              formatter={(value) => (
                <span className="text-xs text-slate-700" title={String(value)}>
                  {value}
                </span>
              )}
            />
            {series.flatMap((s) => [
              <Bar
                key={`${s.id}${PAD}`}
                dataKey={`${s.id}${PAD}`}
                stackId={s.id}
                fill="transparent"
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
                maxBarSize={40}
              />,
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId={s.id}
                name={s.name}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              />,
            ])}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {missingNote}
    </div>
  );
}
