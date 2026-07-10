import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { HospitalComparePeer, HospitalTrend } from "@shared/types";
import {
  COMPARISON_MEASURES,
  formatMeasureValue,
  type MeasureValueType,
} from "@shared/measures";
import { CHART, individualHospitalColor } from "@shared/chartTheme";

interface Props {
  trend: HospitalTrend;
  compareTrends?: HospitalTrend[];
  compareHospitals?: HospitalComparePeer[];
  baseHospitalName: string;
  facilityId: string;
  selectedMeasureId: string;
  maxYears?: number;
}

interface Series {
  id: string;
  name: string;
  color: string;
  trend?: HospitalTrend;
}

/**
 * Fixed-dimension trend chart for the print/PDF report. Unlike TrendChart, this
 * avoids ResponsiveContainer — a hidden (display:none) element measures as 0px
 * wide, so the on-screen chart never renders in the print snapshot. Explicit
 * width/height make recharts lay out synchronously even while hidden.
 */
export function PrintTrendChart({
  trend,
  compareTrends = [],
  compareHospitals = [],
  baseHospitalName,
  facilityId,
  selectedMeasureId,
  maxYears = 8,
}: Props) {
  const measure = COMPARISON_MEASURES.find((m) => m.id === selectedMeasureId);
  if (!measure || !trend.points.length) return null;

  const byFacility = new Map(compareTrends.map((t) => [t.facilityId, t]));
  const series: Series[] = [
    { id: facilityId, name: baseHospitalName, color: CHART.baseHospital, trend },
    ...compareHospitals.map((ch, i) => ({
      id: ch.hospital.facilityId,
      name: ch.hospital.name,
      color: individualHospitalColor(i),
      trend: byFacility.get(ch.hospital.facilityId),
    })),
  ];

  const yearSet = new Set<number>();
  for (const s of series) {
    for (const p of s.trend?.points ?? []) {
      if (p.scores[selectedMeasureId] != null) yearSet.add(p.year);
    }
  }
  const years = Array.from(yearSet)
    .sort((a, b) => a - b)
    .slice(-Math.max(1, maxYears));

  if (years.length === 0) return null;

  const data = years.map((year) => {
    const row: Record<string, number | string | null> = { year: String(year) };
    for (const s of series) {
      const pt = s.trend?.points.find((p) => p.year === year);
      const score = pt?.scores[selectedMeasureId];
      row[s.id] = score == null ? null : score;
    }
    return row;
  });

  const values: number[] = [];
  for (const row of data) {
    for (const s of series) {
      const v = row[s.id];
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
  }

  const domain = fitDomain(measure.valueType, values);

  return (
    <div className="print-trends-chart">
      <BarChart
        width={700}
        height={260}
        data={data}
        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        barCategoryGap={data.length <= 2 ? "45%" : "18%"}
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="year" type="category" tick={{ fontSize: 11 }} interval={0} />
        <YAxis
          domain={domain}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => formatMeasureValue(Number(v), measure.valueType)}
          width={44}
        />
        <Legend wrapperStyle={{ paddingTop: 8, fontSize: 10 }} />
        {series.map((s) => (
          <Bar
            key={s.id}
            dataKey={s.id}
            name={s.name}
            fill={s.color}
            radius={[2, 2, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </div>
  );
}

function fitDomain(
  valueType: MeasureValueType,
  values: number[],
): [number, number] | [number, "auto"] {
  if (valueType === "star") return [0, 5];
  if (values.length === 0) return valueType === "sir" ? [0, 1] : [0, 100];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (valueType === "sir") {
    const pad = Math.max((max - min) * 0.15, 0.05);
    return [Math.max(0, min - pad), max + pad];
  }
  const pad = Math.max((max - min) * 0.15, 1);
  const lo = Math.max(0, Math.floor(min - pad));
  const hi = Math.min(100, Math.ceil(max + pad));
  if (hi <= lo) return [Math.max(0, lo - 1), Math.min(100, lo + 1)];
  return [lo, hi];
}
