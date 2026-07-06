import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ComparisonResult } from "@shared/types";
import {
  COMPARISON_MEASURES,
  MEASURE_GROUPS,
  formatMeasureValue,
  getMeasureDefinition,
  type MeasureGroup,
} from "@shared/measures";

type SortKey = "category" | "measure" | "gap-national" | "gap-state" | "gap-county";

interface Props {
  comparison: ComparisonResult;
  groupFilter: MeasureGroup | "all";
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  visiblePeerKeys: Set<string>;
}

function nationalGap(
  value: number | null,
  national: number | null,
  higherIsBetter: boolean,
): number | null {
  if (value === null || national === null) return null;
  return higherIsBetter ? value - national : national - value;
}

function deltaIcon(delta: number | null) {
  if (delta === null) return <Minus className="h-3.5 w-3.5 text-slate-300" />;
  if (delta > 0.05) return <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (delta < -0.05) return <ArrowDown className="h-3.5 w-3.5 text-rose-600" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

export function ComparisonTable({
  comparison,
  groupFilter,
  sortBy,
  sortDir,
  visiblePeerKeys,
}: Props) {
  const hospitalScores = useMemo(
    () => new Map(comparison.hospitalScores.map((s) => [s.measureId, s.value])),
    [comparison.hospitalScores],
  );

  const rows = useMemo(() => {
    let measures = [...COMPARISON_MEASURES];
    if (groupFilter !== "all") measures = measures.filter((m) => m.group === groupFilter);

    const groupOrder = MEASURE_GROUPS.map((g) => g.id);
    measures.sort((a, b) => {
      if (sortBy === "category") {
        const ga = groupOrder.indexOf(a.group);
        const gb = groupOrder.indexOf(b.group);
        if (ga !== gb) return sortDir === "asc" ? ga - gb : gb - ga;
        return sortDir === "asc" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
      }
      if (sortBy === "measure") {
        return sortDir === "asc" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
      }

      const va = hospitalScores.get(a.id);
      const vb = hospitalScores.get(b.id);

      const gapFor = (id: string, v: number | null | undefined, baseline: Record<string, number | null>) => {
        const def = getMeasureDefinition(id);
        if (v == null || !def) return -Infinity;
        const base = baseline[id] ?? 0;
        return def.higherIsBetter ? v - base : base - v;
      };

      if (sortBy === "gap-national") {
        const da = gapFor(a.id, va, comparison.nationalScores);
        const db = gapFor(b.id, vb, comparison.nationalScores);
        return sortDir === "asc" ? da - db : db - da;
      }
      if (sortBy === "gap-county") {
        const da = gapFor(a.id, va, comparison.countyScores);
        const db = gapFor(b.id, vb, comparison.countyScores);
        return sortDir === "asc" ? da - db : db - da;
      }
      const da = gapFor(a.id, va, comparison.stateScores);
      const db = gapFor(b.id, vb, comparison.stateScores);
      return sortDir === "asc" ? da - db : db - da;
    });

    return measures;
  }, [comparison, groupFilter, hospitalScores, sortBy, sortDir]);

  const visiblePeers = comparison.peers.filter((p) => visiblePeerKeys.has(p.groupKey));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold">Category / Measure</th>
            <th className="px-4 py-3 font-semibold">Your hospital</th>
            <th className="px-4 py-3 font-semibold">County avg</th>
            <th className="px-4 py-3 font-semibold">State avg</th>
            <th className="px-4 py-3 font-semibold">National avg</th>
            {visiblePeers.map((p) => (
              <th key={p.groupKey} className="whitespace-nowrap px-4 py-3 font-semibold">
                {p.label}
                {p.hospitalCount > 0 && (
                  <span className="mt-0.5 block text-[10px] font-normal normal-case text-slate-400">
                    n={p.hospitalCount}
                  </span>
                )}
              </th>
            ))}
            <th className="px-4 py-3 font-semibold">vs National</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((measure) => {
            const def = getMeasureDefinition(measure.id)!;
            const value = hospitalScores.get(measure.id) ?? null;
            const national = comparison.nationalScores[measure.id] ?? null;
            const state = comparison.stateScores[measure.id] ?? null;
            const county = comparison.countyScores[measure.id] ?? null;
            const gap = nationalGap(value, national, def.higherIsBetter);
            const groupLabel = MEASURE_GROUPS.find((g) => g.id === measure.group)?.label;
            const gapDecimals = def.valueType === "sir" ? 3 : 1;

            return (
              <tr key={measure.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <div className="text-xs font-medium text-teal-700">{groupLabel}</div>
                  <div className="font-medium text-slate-900">{measure.label}</div>
                  {def.valueType === "sir" && (
                    <div className="text-[10px] text-slate-400">Lower SIR is better</div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {formatMeasureValue(value, def.valueType)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatMeasureValue(county, def.valueType)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatMeasureValue(state, def.valueType)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatMeasureValue(national, def.valueType)}
                </td>
                {visiblePeers.map((peer) => (
                  <td key={peer.groupKey} className="px-4 py-3 text-slate-600">
                    {formatMeasureValue(peer.scores[measure.id] ?? null, def.valueType)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {deltaIcon(gap)}
                    <span
                      className={
                        gap !== null && gap > 0.05
                          ? "text-emerald-700"
                          : gap !== null && gap < -0.05
                            ? "text-rose-700"
                            : "text-slate-500"
                      }
                    >
                      {gap !== null
                        ? `${gap > 0 ? "+" : ""}${Number(gap.toFixed(gapDecimals))}`
                        : "—"}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
