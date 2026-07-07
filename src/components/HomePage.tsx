import {
  Activity,
  ArrowRight,
  BarChart3,
  Database,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "@shared/measures";
import { usePartner } from "@/context/PartnerContext";

interface Props {
  onStartCompare: () => void;
}

export function HomePage({ onStartCompare }: Props) {
  const { partner } = usePartner();
  const subheadline = partner.welcomeSubheadline ?? SITE_TAGLINE;

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border-2 border-brand-primary/40 bg-gradient-to-br from-brand-primary/5 via-white to-brand-secondary/10 p-8 shadow-xl shadow-brand-primary/5 ring-1 ring-brand-primary/20 sm:p-12">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-brand-secondary/15 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-lg">
            <Activity className="h-7 w-7" />
          </div>
          <h2 className="font-display text-4xl leading-tight text-slate-900 sm:text-5xl">
            {partner.welcomeHeadline}
          </h2>
          <p className="mt-4 text-lg text-slate-600">{subheadline}</p>
          <button
            type="button"
            onClick={onStartCompare}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-primary/20 transition hover:bg-brand-primary/90"
          >
            Compare a hospital
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-800">
            <Scale className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">For employers &amp; health plans</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Evaluate in-network hospitals against county, ZIP, and state peers on patient experience,
            infections, and readmissions — the same federal metrics CMS publishes. Useful for benefits
            teams comparing network adequacy without paid &quot;best hospital&quot; lists.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">What {SITE_NAME} does</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Search any Medicare-certified hospital and see how it stacks up against county, ZIP,
            state, and national peers. We chart HCAHPS patient experience scores and CDC NHSN
            infection measures side by side — so you can spot strengths and gaps at a glance.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
            <Database className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">How the data is collected</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Every score comes from public federal datasets: CMS Hospital Compare (HCAHPS surveys,
            general hospital information) and healthcare-associated infection measures reported
            through CDC&apos;s NHSN. Historical trends use CMS archived hospital snapshots. No
            hospital payments, sponsorships, or proprietary ratings — just what agencies publish.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">Why unbiased data matters now</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Many &quot;best hospital&quot; lists are influenced by advertising and paid placements.
            When choosing where to get care — or advocating for your community — you deserve
            measures that aren&apos;t for sale. Public CMS and CDC data level the field so you can
            compare on facts, not marketing budgets.
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-brand-primary/30 bg-gradient-to-r from-brand-primary/5 to-brand-secondary/10 p-6 sm:p-8">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-brand-primary shadow-sm ring-1 ring-brand-primary/20">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Ready to compare?</h3>
              <p className="mt-1 text-sm text-slate-600">
                Search by hospital name, city, or ZIP. Add peer hospitals, export to CSV or PDF,
                and explore year-over-year trends.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStartCompare}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-brand-primary bg-white px-5 py-2.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/5"
          >
            Start comparing
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-white to-indigo-50/40 p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-sm">
            <Scale className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Why &ldquo;Parigrado&rdquo;?</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              The name blends the Italian and Latin roots{" "}
              <span className="font-semibold text-indigo-700">pari</span> (equal, on par) and{" "}
              <span className="font-semibold text-orange-700">grado</span> (grade, degree) — because
              our mission is to grade hospitals on an equal, unbiased footing, using the same public
              federal metrics for everyone.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800">
                pari · equal
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-800">
                grado · grade
              </span>
            </div>
          </div>
        </div>
      </section>

      <p className="px-1 text-sm text-slate-500">
        Every score comes from public federal datasets — CMS Hospital Compare (HCAHPS),
        CDC/NHSN infection measures, CMS readmissions, and CMS archived snapshots. See{" "}
        <a
          href="#data-sources"
          className="font-medium text-brand-primary underline decoration-brand-primary/30 underline-offset-2 hover:text-brand-primary/80"
        >
          data sources &amp; disclaimer
        </a>{" "}
        for details and source links.
      </p>
    </div>
  );
}
