import { TrendingDown, TrendingUp } from "lucide-react";
import type { ComparisonResult, HospitalSummary } from "@shared/types";
import { computeComparisonSummary, type GapItem } from "@/lib/comparisonSummary";
import {
  formatGapValue,
  formatMeasureValue,
  getMeasureDefinition,
} from "@shared/measures";
import { CHART, individualHospitalColor } from "@shared/chartTheme";

interface Props {
  comparison: ComparisonResult;
  compareHospitals?: HospitalSummary[];
  onSelectCategory?: (categoryId: string) => void;
}

function shortName(name: string, max = 16): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

function ScoreRow({
  item,
  comparison,
  tone,
}: {
  item: GapItem;
  comparison: ComparisonResult;
  tone: "win" | "gap";
}) {
  const def = getMeasureDefinition(item.measureId);
  const valueType = def?.valueType ?? "linear";
  const hospitalValue =
    comparison.hospitalScores.find((s) => s.measureId === item.measureId)?.value ?? null;
  const peers = comparison.compareHospitals ?? [];

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-slate-800">{item.label}</span>
        <span
          className={`text-xs font-semibold ${
            tone === "win" ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {formatGapValue(item.gap, valueType)} vs state
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-slate-500">You</span>
          <span className="font-bold tabular-nums" style={{ color: CHART.baseHospital }}>
            {formatMeasureValue(hospitalValue, valueType)}
          </span>
        </span>
        {peers.map((ch, i) => (
          <span key={ch.groupKey} className="inline-flex max-w-[11rem] items-baseline gap-1.5">
            <span className="truncate text-slate-500" title={ch.hospital.name}>
              {shortName(ch.hospital.name)}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: individualHospitalColor(i) }}
            >
              {formatMeasureValue(ch.scores[item.measureId] ?? null, valueType)}
            </span>
          </span>
        ))}
      </div>
    </li>
  );
}

export function ComparisonSummary({
  comparison,
  compareHospitals = [],
  onSelectCategory,
}: Props) {
  const stats = computeComparisonSummary(comparison, "state");
  const { aboveState, totalWithData, biggestWins, biggestGaps, byCategory } = stats;
  const hasCompare = (comparison.compareHospitals?.length ?? 0) > 0;

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

      {(hasCompare || compareHospitals.length > 0) && (
        <p className="mt-3 text-sm text-slate-600">
          Compared with:{" "}
          <span className="font-medium text-slate-800">
            {(comparison.compareHospitals ?? [])
              .map((ch) => ch.hospital.name)
              .join(" · ") || compareHospitals.map((h) => h.name).join(" · ")}
          </span>
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {biggestWins.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
              <TrendingUp className="h-3.5 w-3.5" /> Biggest strengths
            </p>
            <ul className="space-y-2">
              {biggestWins.map((g) => (
                <ScoreRow key={g.measureId} item={g} comparison={comparison} tone="win" />
              ))}
            </ul>
          </div>
        )}
        {biggestGaps.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-rose-800">
              <TrendingDown className="h-3.5 w-3.5" /> Largest gaps
            </p>
            <ul className="space-y-2">
              {biggestGaps.map((g) => (
                <ScoreRow key={g.measureId} item={g} comparison={comparison} tone="gap" />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
