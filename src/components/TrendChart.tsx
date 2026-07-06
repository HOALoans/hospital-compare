import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { HospitalTrend } from "@shared/types";
import { COMPARISON_MEASURES, formatMeasureValue } from "@shared/measures";

interface Props {
  trend: HospitalTrend;
  selectedMeasureId: string;
}

export function TrendChart({ trend, selectedMeasureId }: Props) {
  const measure = COMPARISON_MEASURES.find((m) => m.id === selectedMeasureId);
  if (!trend.points.length || !measure) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Historical trend data is not loaded for this hospital yet. Parigrado imports CMS hospital
        archives (2019–2026) automatically — charts usually appear within a few minutes after the
        server starts.{" "}
        <a
          href="https://data.cms.gov/provider-data/archived-data/hospitals"
          className="text-indigo-700 underline"
          target="_blank"
          rel="noreferrer"
        >
          View CMS archives
        </a>
      </div>
    );
  }

  const data = trend.points.map((p) => ({
    year: p.year,
    label: p.releaseLabel,
    value: p.scores[selectedMeasureId] ?? null,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis
            domain={
              measure.valueType === "star"
                ? [1, 5]
                : measure.valueType === "sir"
                  ? ["auto", "auto"]
                  : [0, 100]
            }
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number) => formatMeasureValue(value, measure.valueType)}
            labelFormatter={(year) => `Year ${year}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            name={measure.label}
            stroke="#0f766e"
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
