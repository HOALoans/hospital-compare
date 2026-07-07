import { ArrowLeft, BarChart3, Building2, MapPin, Scale } from "lucide-react";
import { OWNERSHIP_LABELS } from "@shared/ownership";
import { SITE_NAME } from "@shared/measures";

interface Props {
  onBack: () => void;
  onStartCompare: () => void;
}

export function MethodologyPage({ onBack, onStartCompare }: Props) {
  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="font-display text-3xl text-slate-900">How we compute comparisons</h2>
        <p className="mt-3 text-slate-600">
          {SITE_NAME} uses only public CMS Hospital Compare data. Peer averages are simple
          unweighted means across hospitals in each group that report a score for that measure.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <MapPin className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-slate-900">County peers</h3>
          <p className="mt-2 text-sm text-slate-600">
            All hospitals in the same CMS county/parish and state. We also split by ownership:
            for-profit, non-profit, and all hospitals combined.
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
            <Building2 className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-slate-900">ZIP prefix peers</h3>
          <p className="mt-2 text-sm text-slate-600">
            Hospitals sharing the first three digits of their ZIP code (ZIP-3). Useful when several
            facilities serve the same metro area across county lines.
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-800">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-slate-900">State peers</h3>
          <p className="mt-2 text-sm text-slate-600">
            All hospitals in the same state, with optional splits by ownership group:{" "}
            {Object.values(OWNERSHIP_LABELS).join(", ")}.
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Scale className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-slate-900">National benchmark</h3>
          <p className="mt-2 text-sm text-slate-600">
            Mean across all U.S. hospitals reporting each measure in the current CMS release.
            Infection measures (SIR) and readmission rates use lower-is-better direction.
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-indigo-200/60 bg-indigo-50/50 p-6">
        <h3 className="text-lg font-semibold text-slate-900">For employers &amp; health plans</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Benefits teams and network designers can use these peer benchmarks to see whether contracted
          hospitals outperform local for-profit, non-profit, or statewide averages on patient experience,
          infections, and readmissions — using the same federal data regulators publish, without
          paid ranking lists. Pair county and ZIP peers to evaluate regional network adequacy; use
          state and national baselines for large self-insured employers comparing markets.
        </p>
        <button
          type="button"
          onClick={onStartCompare}
          className="mt-4 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
        >
          Compare a hospital
        </button>
      </section>
    </div>
  );
}
