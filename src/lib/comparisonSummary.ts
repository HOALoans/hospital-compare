import type { ComparisonResult } from "@shared/types";
import {
  COMPARISON_MEASURES,
  MEASURE_CATEGORIES,
  getMeasureDefinition,
  type MeasureCategory,
} from "@shared/measures";

export interface ComparisonSummaryStats {
  totalWithData: number;
  aboveState: number;
  belowState: number;
  atState: number;
  aboveNational: number;
  belowNational: number;
  biggestWins: GapItem[];
  biggestGaps: GapItem[];
  byCategory: CategorySummary[];
}

export interface CategorySummary {
  id: MeasureCategory;
  label: string;
  above: number;
  total: number;
}

export interface GapItem {
  measureId: string;
  label: string;
  gap: number;
  hospitalValue: number;
  benchmarkValue: number;
  benchmarkLabel: string;
  category: MeasureCategory;
}

function gapVsBenchmark(
  hospitalValue: number | null,
  benchmark: number | null,
  higherIsBetter: boolean,
): number | null {
  if (hospitalValue === null || benchmark === null) return null;
  return higherIsBetter ? hospitalValue - benchmark : benchmark - hospitalValue;
}

export function computeComparisonSummary(
  comparison: ComparisonResult,
  benchmark: "state" | "national" = "state",
): ComparisonSummaryStats {
  const baseline =
    benchmark === "state" ? comparison.stateScores : comparison.nationalScores;
  const benchmarkLabel = benchmark === "state" ? "state" : "national";

  const gaps: GapItem[] = [];
  let above = 0;
  let below = 0;
  let at = 0;

  for (const measure of COMPARISON_MEASURES) {
    const def = getMeasureDefinition(measure.id);
    if (!def) continue;
    const hospitalValue =
      comparison.hospitalScores.find((s) => s.measureId === measure.id)?.value ?? null;
    const benchmarkValue = baseline[measure.id] ?? null;
    const gap = gapVsBenchmark(hospitalValue, benchmarkValue, def.higherIsBetter);
    if (gap === null || hospitalValue === null || benchmarkValue === null) continue;

    if (gap > 0.05) above++;
    else if (gap < -0.05) below++;
    else at++;

    gaps.push({
      measureId: measure.id,
      label: measure.label,
      gap,
      hospitalValue,
      benchmarkValue,
      benchmarkLabel,
      category: measure.category,
    });
  }

  const sorted = [...gaps].sort((a, b) => b.gap - a.gap);
  const biggestWins = sorted.filter((g) => g.gap > 0.05).slice(0, 3);
  const biggestGaps = [...gaps]
    .sort((a, b) => a.gap - b.gap)
    .filter((g) => g.gap < -0.05)
    .slice(0, 3);

  const byCategory: CategorySummary[] = MEASURE_CATEGORIES.map((cat) => {
    const inCat = gaps.filter((g) => g.category === cat.id);
    return {
      id: cat.id,
      label: cat.label,
      above: inCat.filter((g) => g.gap > 0.05).length,
      total: inCat.length,
    };
  });

  return {
    totalWithData: gaps.length,
    aboveState: benchmark === "state" ? above : 0,
    belowState: benchmark === "state" ? below : 0,
    atState: benchmark === "state" ? at : 0,
    aboveNational: benchmark === "national" ? above : 0,
    belowNational: benchmark === "national" ? below : 0,
    biggestWins,
    biggestGaps,
    byCategory,
  };
}
