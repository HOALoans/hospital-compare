import type { ComparisonResult } from "@shared/types";
import { SITE_NAME } from "@shared/measures";
import { computeComparisonSummary } from "@/lib/comparisonSummary";
import { formatMeasureValue, getMeasureDefinition } from "@shared/measures";

interface Props {
  comparison: ComparisonResult;
  hospitalName: string;
}

/** Print-only one-page executive summary */
export function ExecutiveSummaryPrint({ comparison, hospitalName }: Props) {
  const stats = computeComparisonSummary(comparison, "state");

  return (
    <section className="executive-summary-print hidden print:block">
      <h2 className="font-display text-2xl text-slate-900">{SITE_NAME} — Executive Summary</h2>
      <p className="mt-1 text-sm text-slate-600">{hospitalName}</p>
      <p className="mt-4 text-base font-semibold text-slate-900">
        Above state average on {stats.aboveState} of {stats.totalWithData} measures with data
      </p>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold uppercase text-emerald-800">Key wins vs state</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {stats.biggestWins.map((g) => {
              const def = getMeasureDefinition(g.measureId);
              return (
                <li key={g.measureId}>
                  {g.label}: +{formatMeasureValue(g.gap, def?.valueType ?? "linear")}
                </li>
              );
            })}
            {stats.biggestWins.length === 0 && <li className="text-slate-500">None identified</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase text-rose-800">Key gaps vs state</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {stats.biggestGaps.map((g) => {
              const def = getMeasureDefinition(g.measureId);
              return (
                <li key={g.measureId}>
                  {g.label}: {formatMeasureValue(g.gap, def?.valueType ?? "linear")}
                </li>
              );
            })}
            {stats.biggestGaps.length === 0 && <li className="text-slate-500">None identified</li>}
          </ul>
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Reporting period {comparison.period.start} – {comparison.period.end}. Public CMS data for
        informational purposes only.
      </p>
    </section>
  );
}
