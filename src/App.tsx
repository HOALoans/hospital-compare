import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ExternalLink,
  Info,
  Loader2,
} from "lucide-react";
import type { ComparisonResult, HospitalSummary, HospitalTrend } from "@shared/types";
import {
  DATA_SOURCES,
  MEASURE_GROUPS,
  COMPARISON_MEASURES,
  SITE_NAME,
  SITE_TAGLINE,
  type MeasureGroup,
} from "@shared/measures";
import { OWNERSHIP_LABELS } from "@shared/ownership";
import { fetchComparison, fetchHealth, fetchTrends } from "@/lib/api";
import { HospitalSearch } from "@/components/HospitalSearch";
import { ComparisonTable } from "@/components/ComparisonTable";
import { TrendChart } from "@/components/TrendChart";

type SortKey = "category" | "measure" | "gap-national" | "gap-state" | "gap-county";

const DEFAULT_PEERS = new Set([
  "county-all",
  "county-for-profit",
  "county-non-profit",
  "zip3-all",
  "state-all",
  "national",
]);

export default function App() {
  const [ready, setReady] = useState(false);
  const [directoryReady, setDirectoryReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<HospitalSummary | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [trend, setTrend] = useState<HospitalTrend | null>(null);
  const [groupFilter, setGroupFilter] = useState<MeasureGroup | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visiblePeers, setVisiblePeers] = useState<Set<string>>(DEFAULT_PEERS);
  const [trendMeasure, setTrendMeasure] = useState(COMPARISON_MEASURES[0].id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const health = await fetchHealth();
        setReady(health.ready);
        setDirectoryReady(health.directoryReady ?? health.ready);
        if (!health.ready) setTimeout(poll, 3000);
      } catch {
        setTimeout(poll, 5000);
      }
    };
    poll();
  }, []);

  const loadHospital = useCallback(async (hospital: HospitalSummary) => {
    setSelected(hospital);
    setLoading(true);
    setError(null);
    try {
      const [comp, tr] = await Promise.all([
        fetchComparison(hospital.facilityId),
        fetchTrends(hospital.facilityId),
      ]);
      setComparison(comp);
      setTrend(tr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comparison");
      setComparison(null);
      setTrend(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const togglePeer = (key: string) => {
    setVisiblePeers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-tight text-slate-900">{SITE_NAME}</h1>
              <p className="text-sm text-slate-500">{SITE_TAGLINE}</p>
            </div>
          </div>
          {!ready && (
            <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {directoryReady
                ? "Loading quality scores from CMS…"
                : "Loading CMS hospital directory…"}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-teal-700" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Find your hospital</h2>
              <p className="mt-1 text-sm text-slate-600">
                Compare HCAHPS patient experience and CDC NHSN infection measures against county,
                ZIP, state, and national peers — including for-profit vs non-profit hospitals.
              </p>
            </div>
          </div>
          <HospitalSearch onSelect={loadHospital} />
        </section>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Building comparison…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {comparison && selected && !loading && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-teal-50 to-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-3xl text-slate-900">{selected.name}</h2>
                  <p className="mt-1 text-slate-600">
                    {selected.city}, {selected.state} {selected.zip} · {selected.county} County
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {selected.hospitalType} · {selected.ownership} (
                    {OWNERSHIP_LABELS[selected.ownershipGroup]})
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Reporting period: {comparison.period.start} – {comparison.period.end}
                  </p>
                </div>
                {selected.overallRating && (
                  <div className="rounded-xl border border-teal-100 bg-white px-5 py-3 text-center shadow-sm">
                    <div className="text-3xl font-bold text-teal-800">{selected.overallRating}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      CMS overall stars
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value as MeasureGroup | "all")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All categories</option>
                  {MEASURE_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>

                <label className="ml-2 text-sm font-medium text-slate-700">Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="category">Category</option>
                  <option value="measure">Measure name</option>
                  <option value="gap-national">Gap vs national</option>
                  <option value="gap-county">Gap vs county</option>
                  <option value="gap-state">Gap vs state</option>
                </select>
                <select
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-slate-700">Compare groups:</span>
                {comparison.peers.map((peer) => (
                  <button
                    key={peer.groupKey}
                    type="button"
                    onClick={() => togglePeer(peer.groupKey)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      visiblePeers.has(peer.groupKey)
                        ? "bg-teal-700 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {peer.label}
                  </button>
                ))}
              </div>

              <ComparisonTable
                comparison={comparison}
                groupFilter={groupFilter}
                sortBy={sortBy}
                sortDir={sortDir}
                visiblePeerKeys={visiblePeers}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-teal-700" />
                <h3 className="text-lg font-semibold text-slate-900">Historical trends</h3>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Year-over-year scores from CMS archived hospital snapshots (2019–2026, per CMS
                retention policy). Archives are downloaded automatically in the background.
              </p>
              <select
                value={trendMeasure}
                onChange={(e) => setTrendMeasure(e.target.value)}
                className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {COMPARISON_MEASURES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {trend && <TrendChart trend={trend} selectedMeasureId={trendMeasure} />}
            </section>
          </>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Info className="h-5 w-5 text-teal-700" />
            <h3 className="text-lg font-semibold text-slate-900">Data sources</h3>
          </div>
          <ul className="space-y-3">
            {DATA_SOURCES.map((src) => (
              <li key={src.name} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{src.name}</div>
                  <div className="text-slate-500">{src.description}</div>
                </div>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-teal-700 hover:underline"
                >
                  {src.agency} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Public CMS & CDC-reported data for informational purposes only. Not medical advice.
      </footer>
    </div>
  );
}
