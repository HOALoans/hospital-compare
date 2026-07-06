import type { ComparisonResult } from "@shared/types";
import { COMPARISON_MEASURES, MEASURE_GROUPS } from "@shared/measures";

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

export interface CsvExportOptions {
  visiblePeerKeys: Set<string>;
}

export function buildComparisonCsv(
  comparison: ComparisonResult,
  { visiblePeerKeys }: CsvExportOptions,
): string {
  const lines: string[] = [];
  const { hospital, period } = comparison;
  const visiblePeers = comparison.peers.filter((p) => visiblePeerKeys.has(p.groupKey));
  const compareHospitals = comparison.compareHospitals ?? [];

  lines.push(row(["Parigrado.com Hospital Comparison Export"]));
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
  lines.push("");

  const peerHeaders = visiblePeers.map((p) => p.label);
  const compareHeaders = compareHospitals.map((ch) => ch.hospital.name);

  lines.push(
    row([
      "Category",
      "Measure",
      "Measure ID",
      "Hospital Score",
      "National",
      "State",
      "County",
      ...peerHeaders,
      ...compareHeaders,
    ]),
  );

  const hospitalScores = new Map(
    comparison.hospitalScores.map((s) => [s.measureId, s.value]),
  );

  for (const measure of COMPARISON_MEASURES) {
    const groupLabel = MEASURE_GROUPS.find((g) => g.id === measure.group)?.label ?? measure.group;
    const value = hospitalScores.get(measure.id) ?? null;

    lines.push(
      row([
        groupLabel,
        measure.label,
        measure.id,
        value,
        comparison.nationalScores[measure.id] ?? null,
        comparison.stateScores[measure.id] ?? null,
        comparison.countyScores[measure.id] ?? null,
        ...visiblePeers.map((p) => p.scores[measure.id] ?? null),
        ...compareHospitals.map((ch) => ch.scores[measure.id] ?? null),
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
