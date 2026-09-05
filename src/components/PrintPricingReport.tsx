import type { HptCompareResponse, HptMetric, HptPayer } from "@shared/hpt";
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
          Side-by-side HCPCS standard charges from each hospital&apos;s CMS machine-readable file.
        </p>
        <p className="print-footnote">Generated {generated} · {brandName}</p>
      </section>

      <section className="print-table-section">
        <h2 className="print-table-title">Procedure prices</h2>
        <p className="print-table-note">
          Prices for hospitals you loaded — no national or ZIP benchmarks.
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
              </tr>
            ))}
          </tbody>
        </table>
        <p className="print-footnote">
          Source: hospital CMS price-transparency MRFs
        </p>
      </section>
    </div>
  );
}
