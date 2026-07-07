import { useMemo } from "react";
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
import { COMPARISON_MEASURES, formatMeasureValue } from "@shared/measures";
import { CHART, individualHospitalColor } from "@shared/chartTheme";

import { TrendEmptyState } from "@/components/TrendEmptyState";

interface Props {
  trend: HospitalTrend;
  compareTrends?: HospitalTrend[];
  compareHospitals?: HospitalComparePeer[];
  baseHospitalName: string;
  selectedMeasureId: string;
  facilityId: string;
  maxYears: number;
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

  if (!trend.points.length || !measure) {
    return <TrendEmptyState facilityId={facilityId} hasTrendData={false} />;
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
        No historical values available for this measure in the selected range.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis
            domain={
              measure.valueType === "star"
                ? [0, 5]
                : measure.valueType === "sir"
                  ? ["auto", "auto"]
                  : [0, 100]
            }
            tick={{ fontSize: 12 }}
          />
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
  );
}
