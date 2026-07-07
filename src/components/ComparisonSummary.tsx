import { TrendingDown, TrendingUp } from "lucide-react";
import type { ComparisonResult } from "@shared/types";
import { computeComparisonSummary } from "@/lib/comparisonSummary";
import { formatMeasureValue, getMeasureDefinition } from "@shared/measures";
import { CHART } from "@shared/chartTheme";

interface Props {
  comparison: ComparisonResult;
  sticky?: boolean;
}

export function ComparisonSummary({ comparison, sticky = false }: Props) {
  const stats = computeComparisonSummary(comparison, "state");
  const { aboveState, totalWithData, biggestWins, biggestGaps } = stats;

  return (
    <section
      className={`rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5 shadow-sm ${
        sticky ? "mobile-sticky-summary" : ""
      }`}
    >
      <h3 className="text-lg font-semibold text-slate-900">
        Above {comparison.hospital.state} average on{" "}
        <span style={{ color: CHART.baseHospital }}>{aboveState}</span> of{" "}
        {totalWithData} measures
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Compared to all hospitals in {comparison.hospital.state} with CMS data for each measure.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {biggestWins.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
              <TrendingUp className="h-3.5 w-3.5" /> Biggest strengths
            </p>
            <ul className="space-y-1.5 text-sm">
              {biggestWins.map((g) => {
                const def = getMeasureDefinition(g.measureId);
                return (
                  <li key={g.measureId} className="text-slate-700">
                    <span className="font-medium">{g.label}</span>
                    <span className="text-emerald-700">
                      {" "}
                      +{formatMeasureValue(g.gap, def?.valueType ?? "linear")} vs state
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {biggestGaps.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-rose-800">
              <TrendingDown className="h-3.5 w-3.5" /> Largest gaps
            </p>
            <ul className="space-y-1.5 text-sm">
              {biggestGaps.map((g) => {
                const def = getMeasureDefinition(g.measureId);
                return (
                  <li key={g.measureId} className="text-slate-700">
                    <span className="font-medium">{g.label}</span>
                    <span className="text-rose-700">
                      {" "}
                      {formatMeasureValue(g.gap, def?.valueType ?? "linear")} vs state
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
