import type { HptCompareResponse, HptHospitalValue, HptMetric, HptPayer } from "@shared/hpt";
import { SITE_NAME, SITE_TAGLINE } from "@shared/measures";
import { usePartner } from "@/context/PartnerContext";

interface Props {
  data: HptCompareResponse;
  metric: HptMetric;
  payer: HptPayer;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function bandLabel(band: HptHospitalValue["nationalBand"]): string {
  switch (band) {
    case "low":
      return "Lower quarter";
    case "below_median":
      return "Below median";
    case "above_median":
      return "Above median";
    case "high":
      return "Upper quarter";
    default:
      return "—";
  }
}

function shortName(name: string, max = 28): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

/**
 * Print/PDF layout for procedure prices. Hidden on screen; shown via window.print().
 */
export function PrintPricingReport({ data, metric, payer }: Props) {
  const { partner, isPartnerMode } = usePartner();
  const brandName = isPartnerMode && partner ? partner.displayName : SITE_NAME;
  const brandTagline = isPartnerMode && partner?.tagline ? partner.tagline : SITE_TAGLINE;
  const logoSrc =
    isPartnerMode && partner?.logoUrl ? partner.logoUrl : "/parigrado-mark.svg";
  const h = data.hospital;
  const compareNames = data.rows[0]?.compare.map((c) => c.name) ?? [];
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="print-report hidden print:block">
      <header className="print-brand-bar">
        <div className="print-brand-left">
          <img src={logoSrc} alt="" className="print-logo" />
          <div>
            <p className="print-brand-name">{brandName}</p>
            <p className="print-brand-tagline">{brandTagline}</p>
          </div>
        </div>
        <p className="print-brand-right">Procedure Price Report</p>
      </header>

      <section className="print-cover">
        <h1 className="print-hospital">{h.name}</h1>
        <p className="print-meta">
          {h.city}, {h.state}
          {h.zip3 ? ` · ZIP ${h.zip3}xx` : ""}
        </p>
        <p className="print-meta muted">
          {metric === "mean" ? "Mean" : "Median"} ·{" "}
          {payer === "cash" ? "Cash / self-pay" : "All payers (negotiated)"}
          {data.snapshotDate ? ` · Snapshot ${data.snapshotDate}` : ""}
        </p>
        {compareNames.length > 0 && (
          <p className="print-meta">
            Compared with: {compareNames.map((n) => shortName(n)).join("; ")}
          </p>
        )}
        <p className="print-headline">
          HCPCS standard charges from each hospital&apos;s CMS machine-readable file.
        </p>
        <div className="print-about">
          <h3 className="print-section-label">About national figures</h3>
          <p>
            There is no single CMS-published &quot;national average&quot; for negotiated HCPCS
            prices. Parigrado calculates national mean/median and price bands from the hospital
            price files it has crawled so far (currently n=
            {data.rows[0]?.national.n ?? 0} for the first code shown). Bands improve as more
            hospitals are ingested.
          </p>
        </div>
        <p className="print-footnote">Generated {generated} · {brandName}</p>
      </section>

      <section className="print-table-section">
        <h2 className="print-table-title">Procedure prices</h2>
        <p className="print-table-note">
          Up to {data.rows.length} HCPCS codes. &quot;vs national&quot; places the selected
          hospital in the lower or upper part of the crawled distribution.
        </p>
        <table className="print-score-table">
          <thead>
            <tr>
              <th className="col-measure">HCPCS</th>
              <th className="col-measure">Description</th>
              <th>{shortName(h.name, 18)}</th>
              {data.rows[0]?.compare.map((c) => (
                <th key={c.facilityId}>{shortName(c.name, 16)}</th>
              ))}
              <th>National</th>
              <th>{data.rows[0]?.zip3Label ?? "ZIP3"}</th>
              <th>vs national</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.code}>
                <td className="col-measure">{row.code}</td>
                <td className="col-measure">{row.description ?? "—"}</td>
                <td>{money(row.hospital.value)}</td>
                {row.compare.map((c) => (
                  <td key={c.facilityId}>{money(c.value)}</td>
                ))}
                <td>
                  {money(metric === "mean" ? row.national.mean : row.national.median)}
                  <span style={{ display: "block", fontSize: "9pt", color: "#64748b" }}>
                    n={row.national.n}
                  </span>
                </td>
                <td>
                  {money(metric === "mean" ? row.zip3.mean : row.zip3.median)}
                  <span style={{ display: "block", fontSize: "9pt", color: "#64748b" }}>
                    n={row.zip3.n}
                  </span>
                </td>
                <td>
                  {bandLabel(row.hospital.nationalBand)}
                  {row.hospital.percentile != null
                    ? ` (${Math.round(row.hospital.percentile)}th)`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="print-footnote">
          Source: hospital CMS price-transparency MRFs · Coverage{" "}
          {data.coverage.crawledOk.toLocaleString()} hospitals with successful extracts
        </p>
      </section>
    </div>
  );
}
