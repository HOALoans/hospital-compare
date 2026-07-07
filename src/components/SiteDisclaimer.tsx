import { ExternalLink } from "lucide-react";
import { DATA_SOURCES, SITE_NAME } from "@shared/measures";
import { usePartner } from "@/context/PartnerContext";

const CMS_HOSPITAL_COMPARE_URL = "https://www.medicare.gov/care-compare/";

/**
 * De-emphasized footer disclaimer. Keeps the public data-source links
 * accessible (as a small inline list) but folds them into a muted,
 * collapsible "Data sources & disclaimer" block rather than a prominent card.
 */
export function SiteDisclaimer({
  onOpenAdmin,
  showAdminLink = true,
}: {
  onOpenAdmin?: () => void;
  showAdminLink?: boolean;
}) {
  const { partner } = usePartner();
  const showPoweredBy = partner.showPoweredBy ?? false;

  return (
    <footer id="data-sources" className="mt-8 border-t border-slate-200 bg-slate-50/60 no-print">
      <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
        <details className="group text-xs text-slate-400">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-500 transition hover:text-slate-700">
            <span className="text-slate-400 transition group-open:rotate-90">›</span>
            Data sources &amp; disclaimer
          </summary>

          <div className="mt-3 max-w-4xl space-y-3 leading-relaxed">
            <p>
              {SITE_NAME} presents public federal data as-is for informational purposes only.
              Hospital quality measures are sourced from public datasets published by the Centers
              for Medicare &amp; Medicaid Services (CMS Hospital Compare / HCAHPS, readmissions, and
              archived hospital snapshots) and healthcare-associated infection measures reported
              through the CDC&apos;s National Healthcare Safety Network (NHSN).
            </p>
            <p>
              This information is not medical advice and should not be the sole basis for any
              healthcare decision. {SITE_NAME} is not responsible for inaccuracies, errors,
              omissions, or misinformation in the underlying public data, and makes no warranty as
              to its accuracy, completeness, or timeliness. Please verify details directly with the
              hospital and with the official{" "}
              <a
                href={CMS_HOSPITAL_COMPARE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-indigo-700"
              >
                CMS Care Compare
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              tool before making decisions.
            </p>

            <div className="pt-1">
              <span className="font-medium text-slate-500">Public data sources:</span>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {DATA_SOURCES.map((src) => (
                  <li key={src.name}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={src.description}
                      className="inline-flex items-center gap-0.5 text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-indigo-700"
                    >
                      {src.name} <span className="text-slate-400">({src.agency})</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        <p className="mt-4 text-center text-xs text-slate-400">
          © 2026 Parigrado. All rights reserved.
          {showAdminLink && onOpenAdmin && (
            <>
              {" · "}
              <button
                type="button"
                onClick={onOpenAdmin}
                className="text-slate-400 underline decoration-slate-300 underline-offset-2 hover:text-indigo-600"
              >
                Partner admin
              </button>
            </>
          )}
        </p>
        {showPoweredBy && (
          <p className="mt-2 text-center text-xs text-slate-400">
            Powered by{" "}
            <span className="font-medium text-slate-500">{SITE_NAME}</span>
          </p>
        )}
        <p className="mt-2 text-center text-xs text-slate-400">
          <span className="font-medium text-slate-500">{SITE_NAME}</span> · Public CMS &amp;
          CDC-reported data for informational purposes only. Not medical advice.
        </p>
      </div>
    </footer>
  );
}
