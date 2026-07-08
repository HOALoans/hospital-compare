import type { ComparisonResult } from "@shared/types";
import {
  COMPARISON_MEASURES,
  MEASURE_CATEGORIES,
  MEASURE_GROUPS,
  measureUnitLabel,
  type MeasureValueType,
} from "@shared/measures";

/** Peer keys already shown as dedicated National / State / County columns. */
const DEDICATED_PEER_KEYS = new Set(["national", "state-all", "county-all"]);

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function formatCsvScore(value: number | null | undefined, valueType: MeasureValueType): string {
  if (value === null || value === undefined) return "";
  // Plain numbers (no ★ / %) so Excel can chart; unit is in a separate column.
  if (valueType === "sir") return value.toFixed(3);
  return String(Math.round(value * 10) / 10);
}

function signedGap(
  hospital: number | null | undefined,
  benchmark: number | null | undefined,
  higherIsBetter: boolean,
): string {
  if (hospital == null || benchmark == null) return "";
  const gap = higherIsBetter ? hospital - benchmark : benchmark - hospital;
  const rounded = Math.round(gap * 1000) / 1000;
  if (Math.abs(rounded) < 0.0005) return "0";
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export interface CsvExportOptions {
  visiblePeerKeys: Set<string>;
}

export function buildComparisonCsv(
  comparison: ComparisonResult,
  { visiblePeerKeys }: CsvExportOptions,
): string {
  const lines: string[] = [];
  const { hospital, period } = comparison;
  // Extra peer groups only (ownership / ZIP / etc.) — not National/State/County.
  const extraPeers = comparison.peers.filter(
    (p) => visiblePeerKeys.has(p.groupKey) && !DEDICATED_PEER_KEYS.has(p.groupKey),
  );
  const compareHospitals = comparison.compareHospitals ?? [];
  const hospitalCol = hospital.name;
  const stateCol = `${hospital.state} average`;
  const countyCol = `${hospital.county} County average`;

  lines.push(row(["Parigrado Hospital Comparison Export"]));
  lines.push(row(["Hospital", hospital.name]));
  lines.push(row(["Facility ID", hospital.facilityId]));
  lines.push(row(["Location", `${hospital.city}, ${hospital.state} ${hospital.zip}`]));
  lines.push(row(["County", `${hospital.county} County`]));
  lines.push(row(["Hospital Type", hospital.hospitalType]));
  lines.push(row(["Ownership", hospital.ownership]));
  if (hospital.overallRating) {
    lines.push(row(["CMS Overall Stars", hospital.overallRating]));
  }
  lines.push(row(["Reporting Period", `${period.start} – ${period.end}`]));
  lines.push(row(["Exported", new Date().toISOString().slice(0, 10)]));
  lines.push("");

  lines.push(row(["How to read this file"]));
  lines.push(
    row([
      "Each data row is one quality measure. Columns are the hospital score and peer averages for that measure.",
    ]),
  );
  lines.push(
    row([
      "Unit",
      "Stars = 1–5 HCAHPS stars; Score = 0–100 patient-experience linear mean; Percent = 30-day readmission rate; SIR = standardized infection ratio (1.0 = expected infections).",
    ]),
  );
  lines.push(
    row([
      "Direction",
      "Better direction says whether a higher or lower number is better for that measure.",
    ]),
  );
  lines.push(
    row([
      "Gap vs state / Gap vs national",
      "Positive = hospital is better than that benchmark; negative = worse. Already flipped for lower-is-better measures (infections, readmissions).",
    ]),
  );
  lines.push(row(["Blank cells", "No CMS-reported value for that hospital or peer group."]));
  lines.push("");

  const peerHeaders = extraPeers.map((p) => `${p.label} (avg)`);
  const compareHeaders = compareHospitals.map((ch) => ch.hospital.name);

  lines.push(
    row([
      "Category",
      "Subcategory",
      "Measure",
      "CMS Measure ID",
      "Unit",
      "Better direction",
      hospitalCol,
      "National average",
      stateCol,
      countyCol,
      ...peerHeaders,
      ...compareHeaders,
      "Gap vs state",
      "Gap vs national",
    ]),
  );

  const hospitalScores = new Map(
    comparison.hospitalScores.map((s) => [s.measureId, s.value]),
  );

  for (const measure of COMPARISON_MEASURES) {
    const categoryLabel =
      MEASURE_CATEGORIES.find((c) => c.id === measure.category)?.label ?? measure.category;
    const groupLabel = MEASURE_GROUPS.find((g) => g.id === measure.group)?.label ?? measure.group;
    const value = hospitalScores.get(measure.id) ?? null;
    const national = comparison.nationalScores[measure.id] ?? null;
    const state = comparison.stateScores[measure.id] ?? null;
    const county = comparison.countyScores[measure.id] ?? null;

    lines.push(
      row([
        categoryLabel,
        groupLabel,
        measure.label,
        measure.id,
        measureUnitLabel(measure.valueType),
        measure.higherIsBetter ? "Higher is better" : "Lower is better",
        formatCsvScore(value, measure.valueType),
        formatCsvScore(national, measure.valueType),
        formatCsvScore(state, measure.valueType),
        formatCsvScore(county, measure.valueType),
        ...extraPeers.map((p) => formatCsvScore(p.scores[measure.id] ?? null, measure.valueType)),
        ...compareHospitals.map((ch) =>
          formatCsvScore(ch.scores[measure.id] ?? null, measure.valueType),
        ),
        signedGap(value, state, measure.higherIsBetter),
        signedGap(value, national, measure.higherIsBetter),
      ]),
    );
  }

  return lines.join("\n");
}

export function downloadComparisonCsv(
  comparison: ComparisonResult,
  options: CsvExportOptions,
): void {
  const csv = buildComparisonCsv(comparison, options);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const slug = comparison.hospital.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const link = document.createElement("a");
  link.href = url;
  link.download = `parigrado-${slug || "hospital"}-comparison.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
