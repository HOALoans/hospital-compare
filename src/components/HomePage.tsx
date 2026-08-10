import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Database,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { SITE_NAME, SITE_TAGLINE } from "@shared/measures";
import { usePartner } from "@/context/PartnerContext";

interface Props {
  onStartCompare: () => void;
  onOpenMethodology: () => void;
}

export function HomePage({ onStartCompare, onOpenMethodology }: Props) {
  const { partner, partnerId, isPartnerMode } = usePartner();
  const subheadline = partner.welcomeSubheadline ?? SITE_TAGLINE;
  const hospitalHealthHref = partnerId
    ? `/mission-tracker/?partner=${encodeURIComponent(partnerId)}`
    : "/mission-tracker/";

  return (
    <div className="space-y-0">
      <section className="border-b border-[var(--hoals-border)] bg-white px-0 py-10 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-[1120px]">
          <div className="hoals-eyebrow mb-5">Hospital quality</div>
          <h2 className="max-w-3xl text-balance text-[38px] font-extrabold leading-[1.08] tracking-[-0.025em] text-[var(--hoals-ink)] sm:text-[48px] lg:text-[52px]">
            {partner.welcomeHeadline}
          </h2>
          <p className="mt-5 max-w-2xl text-[19px] font-medium leading-[1.5] text-[var(--hoals-text-secondary)]">
            {subheadline}
          </p>
          {isPartnerMode && partner.heroDescription ? (
            <p className="mt-6 max-w-2xl rounded-[14px] border border-[var(--hoals-border)] bg-[var(--hoals-cultured)] px-5 py-4 text-[17px] leading-[1.65] text-[var(--hoals-text-secondary)]">
              {partner.heroDescription}
            </p>
          ) : null}
          <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={onStartCompare} className="btn btn--primary btn--lg">
              Compare multiple hospitals
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <a href={hospitalHealthHref} className="btn btn--secondary btn--lg">
              <span className="sm:hidden">Hospital health</span>
              <span className="hidden sm:inline">Single hospital health dashboard</span>
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </a>
          </div>
        </div>
      </section>

      <section className="bg-[var(--hoals-cultured)] px-0 py-10 sm:py-14 lg:py-20">
        <div className="mx-auto grid max-w-[1120px] gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article className="hoals-card p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--hoals-mist)] text-[var(--hoals-ink)]">
              <Scale className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
              For employers and health plans
            </h3>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
              Evaluate in-network hospitals against county, ZIP, and state peers on patient experience,
              infections, and readmissions — the same federal metrics CMS publishes. Useful for benefits
              teams comparing network adequacy without paid &quot;best hospital&quot; lists.
            </p>
          </article>

          <article className="hoals-card p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--hoals-mist)] text-[var(--hoals-ink)]">
              <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
              What {SITE_NAME} does
            </h3>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
              Search any Medicare-certified hospital and see how it stacks up against county, ZIP,
              state, and national peers. We chart HCAHPS patient experience scores and CDC NHSN
              infection measures side by side — so you can spot strengths and gaps at a glance.
            </p>
          </article>

          <article className="hoals-card p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--hoals-mist)] text-[var(--hoals-ink)]">
              <Database className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
              How the data is collected
            </h3>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
              Every score comes from public federal datasets: CMS Hospital Compare (HCAHPS surveys,
              general hospital information) and healthcare-associated infection measures reported
              through CDC&apos;s NHSN. Historical trends use CMS archived hospital snapshots. No
              hospital payments, sponsorships, or proprietary ratings — just what agencies publish.
            </p>
          </article>

          <article className="hoals-card p-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--hoals-mist)] text-[var(--hoals-ink)]">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
              Why unbiased data matters now
            </h3>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
              Many &quot;best hospital&quot; lists are influenced by advertising and paid placements.
              When choosing where to get care — or advocating for your community — you deserve
              measures that aren&apos;t for sale. Public CMS and CDC data level the field so you can
              compare on facts, not marketing budgets.
            </p>
          </article>
        </div>
      </section>

      <section className="border-b border-[var(--hoals-border)] bg-white px-0 py-10 sm:py-14">
        <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[var(--hoals-mist)] text-[var(--hoals-ink)]">
              <Scale className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
                Ready to compare?
              </h3>
              <p className="mt-1 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
                Search by hospital name, city, or ZIP. Add peer hospitals, export to CSV or PDF,
                and explore year-over-year trends.
              </p>
            </div>
          </div>
          <button type="button" onClick={onStartCompare} className="btn btn--primary shrink-0">
            Compare multiple hospitals
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </section>

      <section className="bg-[var(--hoals-cultured)] px-0 py-10 sm:py-14 lg:py-20">
        <div className="mx-auto grid max-w-[1120px] gap-6 md:grid-cols-2">
          <div className="hoals-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[var(--hoals-blue)] text-white">
                <Scale className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
                  Why &ldquo;Parigrado&rdquo;?
                </h3>
                <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
                  The name blends the Italian and Latin roots{" "}
                  <span className="font-semibold text-[var(--hoals-ink)]">pari</span> (equal, on par)
                  and <span className="font-semibold text-[var(--hoals-ink)]">grado</span> (grade,
                  degree) — because our mission is to grade hospitals on an equal, unbiased footing,
                  using the same public federal metrics for everyone.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--hoals-mist)] px-3 py-1 font-medium text-[var(--hoals-ink)]">
                    pari · equal
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-medium text-[var(--hoals-ink)] ring-1 ring-[var(--hoals-border)]">
                    grado · grade
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="hoals-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[var(--hoals-ink)] text-white">
                <BookOpen className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--hoals-ink)]">
                  Methodology
                </h3>
                <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--hoals-text-secondary)]">
                  See how peer averages, county and state groups, and ownership splits are computed from
                  public CMS Hospital Compare data — with no paid rankings or sponsorships.
                </p>
                <button type="button" onClick={onOpenMethodology} className="btn btn--ghost mt-4 px-0">
                  Read methodology
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <p className="mx-auto max-w-[1120px] px-0 py-8 text-[13px] leading-[1.55] text-[var(--hoals-caption)]">
        Every score comes from public federal datasets — CMS Hospital Compare (HCAHPS),
        CDC/NHSN infection measures, CMS readmissions, and CMS archived snapshots. See{" "}
        <a
          href="#data-sources"
          className="font-medium text-[var(--hoals-blue)] underline decoration-[var(--hoals-mist)] underline-offset-2 hover:text-[var(--hoals-blue-700)]"
        >
          data sources and disclaimer
        </a>{" "}
        for details and source links.
      </p>
    </div>
  );
}
