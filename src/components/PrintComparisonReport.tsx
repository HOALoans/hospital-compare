import type { ComparisonResult } from "@shared/types";
import {
  COMPARISON_MEASURES,
  MEASURE_CATEGORIES,
  MEASURE_GROUPS,
  SITE_NAME,
  SITE_TAGLINE,
  formatGapValue,
  formatMeasureValue,
  getMeasureDefinition,
  measureUnitLabel,
} from "@shared/measures";
import { computeComparisonSummary } from "@/lib/comparisonSummary";
import { usePartner } from "@/context/PartnerContext";

interface Props {
  comparison: ComparisonResult;
}

function shortName(name: string, max = 22): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/**
 * Dedicated print/PDF layout. Hidden on screen; becomes the only content
 * when the user chooses Save as PDF / Print.
 */
export function PrintComparisonReport({ comparison }: Props) {
  const { partner, isPartnerMode } = usePartner();
  const stats = computeComparisonSummary(comparison, "state");
  const { hospital, period } = comparison;
  // Cap columns so the score table fits letter portrait without clipping.
  const compareHospitals = (comparison.compareHospitals ?? []).slice(0, 2);
  const brandName = isPartnerMode ? partner.displayName : SITE_NAME;
  const brandTagline = partner.tagline ?? SITE_TAGLINE;
  const logoSrc = partner.logoUrl || "/parigrado-mark.svg";

  const rows = COMPARISON_MEASURES.map((measure) => {
    const def = getMeasureDefinition(measure.id)!;
    const hospitalValue =
      comparison.hospitalScores.find((s) => s.measureId === measure.id)?.value ?? null;
    const national = comparison.nationalScores[measure.id] ?? null;
    const state = comparison.stateScores[measure.id] ?? null;
    const county = comparison.countyScores[measure.id] ?? null;
    const gapState =
      hospitalValue == null || state == null
        ? null
        : def.higherIsBetter
          ? hospitalValue - state
          : state - hospitalValue;
    const category =
      MEASURE_CATEGORIES.find((c) => c.id === measure.category)?.label ?? measure.category;
    const subcategory =
      MEASURE_GROUPS.find((g) => g.id === measure.group)?.label ?? measure.group;

    return {
      measure,
      def,
      category,
      subcategory,
      hospitalValue,
      national,
      state,
      county,
      gapState,
      compareValues: compareHospitals.map((ch) => ch.scores[measure.id] ?? null),
    };
  });

  const compareCols = compareHospitals.map((ch) => shortName(ch.hospital.name));

  return (
    <div className="print-report hidden print:block">
      <header className="print-brand-bar">
        <div className="print-brand-left">
          <img
            src={logoSrc}
            alt={partner.logoAlt ?? brandName}
            className="print-logo"
          />
          <div>
            <p className="print-brand-name">{brandName}</p>
            <p className="print-brand-tagline">{brandTagline}</p>
          </div>
        </div>
        <p className="print-brand-right">Hospital Quality Report</p>
      </header>

      <section className="print-cover">
        <h1 className="print-hospital">{hospital.name}</h1>
        <p className="print-meta">
          {hospital.city}, {hospital.state} {hospital.zip} · {hospital.county} County
          {hospital.overallRating != null ? ` · CMS overall stars: ${hospital.overallRating}` : ""}
        </p>
        <p className="print-meta muted">
          {hospital.hospitalType} · {hospital.ownership}
        </p>
        <p className="print-headline">
          Above {hospital.state} average on {stats.aboveState} of {stats.totalWithData} measures with
          data
        </p>
        {(comparison.compareHospitals ?? []).length > 0 && (
          <p className="print-meta">
            Compared with:{" "}
            {(comparison.compareHospitals ?? []).map((ch) => ch.hospital.name).join("; ")}
            {(comparison.compareHospitals ?? []).length > compareHospitals.length
              ? " (table shows first 2)"
              : ""}
          </p>
        )}

        <div className="print-two-col">
          <div>
            <h3 className="print-section-label win">Key wins vs state</h3>
            <ul className="print-list">
              {stats.biggestWins.map((g) => {
                const def = getMeasureDefinition(g.measureId);
                return (
                  <li key={g.measureId}>
                    <strong>{g.label}</strong>{" "}
                    <span className="win">{formatGapValue(g.gap, def?.valueType ?? "linear")}</span>
                  </li>
                );
              })}
              {stats.biggestWins.length === 0 && <li className="muted">None identified</li>}
            </ul>
          </div>
          <div>
            <h3 className="print-section-label gap">Key gaps vs state</h3>
            <ul className="print-list">
              {stats.biggestGaps.map((g) => {
                const def = getMeasureDefinition(g.measureId);
                return (
                  <li key={g.measureId}>
                    <strong>{g.label}</strong>{" "}
                    <span className="gap">{formatGapValue(g.gap, def?.valueType ?? "linear")}</span>
                  </li>
                );
              })}
              {stats.biggestGaps.length === 0 && <li className="muted">None identified</li>}
            </ul>
          </div>
        </div>

        <div className="print-about">
          <div>
            <h3 className="print-section-label">About {SITE_NAME}</h3>
            <p>
              Search any Medicare-certified hospital and see how it stacks up against county, ZIP,
              state, and national peers. We chart HCAHPS patient experience scores and CDC NHSN
              infection measures side by side — so you can spot strengths and gaps at a glance.
            </p>
          </div>
          <div>
            <h3 className="print-section-label">How the data is collected</h3>
            <p>
              Every score comes from public federal datasets: CMS Hospital Compare (HCAHPS surveys,
              general hospital information) and healthcare-associated infection measures reported
              through CDC&apos;s NHSN. Historical trends use CMS archived hospital snapshots. No
              hospital payments, sponsorships, or proprietary ratings — just what agencies publish.
            </p>
          </div>
        </div>

        <p className="print-footnote">
          Reporting period {period.start} – {period.end}. Public CMS / CDC data for informational
          purposes only. Positive gaps mean better than the benchmark (already adjusted for
          higher-is-better vs lower-is-better measures). {SITE_NAME} · parigrado.com
        </p>
      </section>

      <section className="print-table-section">
        <h2 className="print-table-title">Measure scores</h2>
        <p className="print-table-note">
          Scores by measure. Gap vs state is positive when this hospital is better than the{" "}
          {hospital.state} average.
        </p>

        <table className="print-score-table">
          <thead>
            <tr>
              <th className="col-measure">Measure</th>
              <th className="col-num">Unit</th>
              <th className="col-num" title={hospital.name}>
                {shortName(hospital.name)}
              </th>
              <th className="col-num">National</th>
              <th className="col-num">{hospital.state}</th>
              <th className="col-num">County</th>
              {compareCols.map((name) => (
                <th key={name} className="col-num" title={name}>
                  {name}
                </th>
              ))}
              <th className="col-num">Gap vs state</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const prevCategory = idx > 0 ? rows[idx - 1]!.category : null;
              const showCategory = row.category !== prevCategory;
              return (
                <tr key={row.measure.id} className={showCategory ? "category-start" : undefined}>
                  <td className="col-measure">
                    {showCategory && <div className="category-label">{row.category}</div>}
                    <div className="measure-label">{row.measure.label}</div>
                    <div className="subcategory-label">
                      {row.subcategory}
                      {" · "}
                      {row.def.higherIsBetter ? "higher better" : "lower better"}
                    </div>
                  </td>
                  <td className="col-num muted">{measureUnitLabel(row.def.valueType)}</td>
                  <td className="col-num hospital-score">
                    {formatMeasureValue(row.hospitalValue, row.def.valueType)}
                  </td>
                  <td className="col-num">
                    {formatMeasureValue(row.national, row.def.valueType)}
                  </td>
                  <td className="col-num">{formatMeasureValue(row.state, row.def.valueType)}</td>
                  <td className="col-num">{formatMeasureValue(row.county, row.def.valueType)}</td>
                  {row.compareValues.map((v, i) => (
                    <td key={compareHospitals[i]!.hospital.facilityId} className="col-num">
                      {formatMeasureValue(v, row.def.valueType)}
                    </td>
                  ))}
                  <td
                    className={`col-num gap-cell ${
                      row.gapState == null
                        ? ""
                        : row.gapState > 0.05
                          ? "win"
                          : row.gapState < -0.05
                            ? "gap"
                            : ""
                    }`}
                  >
                    {formatGapValue(row.gapState, row.def.valueType)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
