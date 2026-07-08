import type { ComparisonResult } from "@shared/types";
import { SITE_NAME } from "@shared/measures";
import { computeComparisonSummary } from "@/lib/comparisonSummary";
import { formatGapValue, getMeasureDefinition } from "@shared/measures";

interface Props {
  comparison: ComparisonResult;
  hospitalName: string;
}

/** Print-only one-page executive summary */
export function ExecutiveSummaryPrint({ comparison, hospitalName }: Props) {
  const stats = computeComparisonSummary(comparison, "state");
  const { hospital, period } = comparison;
  const compareNames = (comparison.compareHospitals ?? []).map((ch) => ch.hospital.name);

  return (
    <section className="executive-summary-print hidden print:block">
      <div className="border-b border-slate-300 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {SITE_NAME}
        </p>
        <h2 className="mt-1 font-display text-3xl text-slate-900">Hospital Quality Report</h2>
        <p className="mt-2 text-lg font-semibold text-slate-800">{hospitalName}</p>
        <p className="mt-1 text-sm text-slate-600">
          {hospital.city}, {hospital.state} {hospital.zip} · {hospital.county} County
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {hospital.hospitalType} · {hospital.ownership}
          {hospital.overallRating ? ` · CMS overall stars: ${hospital.overallRating}` : ""}
        </p>
      </div>

      <p className="mt-5 text-base font-semibold text-slate-900">
        Above {hospital.state} average on {stats.aboveState} of {stats.totalWithData} measures with
        data
      </p>
      {compareNames.length > 0 && (
        <p className="mt-1 text-sm text-slate-600">
          Compared with: {compareNames.join("; ")}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-8">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-800">
            Key wins vs state
          </h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {stats.biggestWins.map((g) => {
              const def = getMeasureDefinition(g.measureId);
              return (
                <li key={g.measureId}>
                  <span className="font-medium">{g.label}</span>
                  <span className="text-emerald-700">
                    {" "}
                    {formatGapValue(g.gap, def?.valueType ?? "linear")} vs state
                  </span>
                </li>
              );
            })}
            {stats.biggestWins.length === 0 && <li className="text-slate-500">None identified</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-rose-800">
            Key gaps vs state
          </h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {stats.biggestGaps.map((g) => {
              const def = getMeasureDefinition(g.measureId);
              return (
                <li key={g.measureId}>
                  <span className="font-medium">{g.label}</span>
                  <span className="text-rose-700">
                    {" "}
                    {formatGapValue(g.gap, def?.valueType ?? "linear")} vs state
                  </span>
                </li>
              );
            })}
            {stats.biggestGaps.length === 0 && <li className="text-slate-500">None identified</li>}
          </ul>
        </div>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        Reporting period {period.start} – {period.end}. Public CMS / CDC data for informational
        purposes only. Positive gaps mean better than the benchmark (accounting for whether higher
        or lower scores are better for each measure).
      </p>
    </section>
  );
}
