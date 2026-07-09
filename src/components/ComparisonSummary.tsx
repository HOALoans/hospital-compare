import { TrendingDown, TrendingUp } from "lucide-react";
import type { ComparisonResult, HospitalSummary } from "@shared/types";
import { computeComparisonSummary } from "@/lib/comparisonSummary";
import { formatGapValue, getMeasureDefinition } from "@shared/measures";
import { CHART } from "@shared/chartTheme";

interface Props {
  comparison: ComparisonResult;
  compareHospitals?: HospitalSummary[];
  onSelectCategory?: (categoryId: string) => void;
}

export function ComparisonSummary({
  comparison,
  compareHospitals = [],
  onSelectCategory,
}: Props) {
  const stats = computeComparisonSummary(comparison, "state");
  const { aboveState, totalWithData, biggestWins, biggestGaps, byCategory } = stats;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-lg font-semibold text-slate-900">
        Above {comparison.hospital.state} average on{" "}
        <span style={{ color: CHART.baseHospital }}>{aboveState}</span> of {totalWithData}{" "}
        measures
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Compared to all hospitals in {comparison.hospital.state} with CMS data for each measure.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {byCategory.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory?.(cat.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-primary/40 hover:bg-brand-primary/5"
          >
            <span className="font-semibold text-slate-900">
              {cat.above}/{cat.total}
            </span>
            <span className="text-slate-500">
              {cat.id === "patient-experience"
                ? "Experience"
                : cat.id === "infections"
                  ? "Infections"
                  : "Readmissions"}{" "}
              above state
            </span>
          </button>
        ))}
      </div>

      {compareHospitals.length > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Compared with:{" "}
          <span className="font-medium text-slate-800">
            {compareHospitals.map((h) => h.name).join(" · ")}
          </span>
        </p>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
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
                      {formatGapValue(g.gap, def?.valueType ?? "linear")} vs state
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
                      {formatGapValue(g.gap, def?.valueType ?? "linear")} vs state
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
