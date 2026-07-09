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
): number[] {
  const values: number[] = [];
  for (const row of data) {
    for (const id of seriesIds) {
      const v = row[id];
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

  // linear / percent — typically 0–100
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
      trend: compareTrends.find((t) => t.facilityId === ch.hospital.facilityId),
    }));
    return [base, ...others];
  }, [trend, compareTrends, compareHospitals, baseHospitalName, facilityId]);

  const data = useMemo(() => {
    const yearSet = new Set<number>();
    for (const s of series) {
      for (const p of s.trend?.points ?? []) {
        if (p.scores[selectedMeasureId] != null) yearSet.add(p.year);
      }
    }
    const years = Array.from(yearSet).sort((a, b) => a - b);
    const recent = years.slice(-Math.max(1, maxYears));
    return recent.map((year) => {
      const row: Record<string, number | string | null> = { year };
      for (const s of series) {
        const pt = s.trend?.points.find((p) => p.year === year);
        row[s.id] = pt?.scores[selectedMeasureId] ?? null;
      }
      return row;
    });
  }, [series, selectedMeasureId, maxYears]);

  const noTrendHospitals = useMemo(
    () =>
      compareHospitals.filter((ch) => {
        const chTrend = compareTrends.find((t) => t.facilityId === ch.hospital.facilityId);
        return !chTrend?.points.some((p) => p.scores[selectedMeasureId] != null);
      }),
    [compareHospitals, compareTrends, selectedMeasureId],
  );

  const values = useMemo(
    () => collectNumericValues(data, series.map((s) => s.id)),
    [data, series],
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

  const missingNote = noTrendHospitals.length > 0 && (
    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span className="font-semibold">No historical CMS data for this measure:</span>{" "}
      {noTrendHospitals.map((ch) => ch.hospital.name).join(", ")}. These hospitals have no bars
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
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis domain={domain} tick={{ fontSize: 12 }} allowDataOverflow />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatMeasureValue(value, measure.valueType),
                name,
              ]}
              labelFormatter={(year) => `Year ${year}`}
            />
            <Legend />
            {series.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                name={s.name}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {missingNote}
    </div>
  );
}
