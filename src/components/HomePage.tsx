import { Activity, ArrowRight, Database } from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "@shared/measures";
import { usePartner } from "@/context/PartnerContext";

interface Props {
  onStartCompare: () => void;
}

export function HomePage({ onStartCompare }: Props) {
  const { partner, isPartnerMode } = usePartner();
  const subheadline = partner.welcomeSubheadline ?? SITE_TAGLINE;

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-primary/8 via-white to-brand-secondary/10 px-6 py-14 sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-brand-secondary/15 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-primary">
            {SITE_NAME}
          </p>
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-lg">
            <Activity className="h-7 w-7" />
          </div>
          <h1 className="font-display text-4xl leading-tight text-slate-900 sm:text-5xl">
            {partner.welcomeHeadline}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">{subheadline}</p>
          {isPartnerMode && partner.heroDescription ? (
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-700">
              {partner.heroDescription}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartCompare}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-primary/20 transition hover:bg-brand-primary/90"
            >
              Compare a hospital
              <ArrowRight className="h-5 w-5" />
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white/70"
            >
              How the data works
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-3xl px-1">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Public CMS &amp; CDC data, side by side</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Search any Medicare-certified hospital and see how it compares to county, state, and
              national peers on patient experience (HCAHPS), infections, and readmissions — the same
              federal metrics CMS publishes. No paid rankings or hospital sponsorships.
            </p>
            <p className="mt-3 text-sm text-slate-500">
              See{" "}
              <a
                href="#data-sources"
                className="font-medium text-brand-primary underline decoration-brand-primary/30 underline-offset-2 hover:text-brand-primary/80"
              >
                data sources &amp; disclaimer
              </a>{" "}
              for details.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
