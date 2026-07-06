import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ExternalLink,
  Info,
  Loader2,
  Printer,
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
import { CHART } from "@shared/chartTheme";
import { fetchComparison, fetchHealth, fetchTrends } from "@/lib/api";
import { HospitalSearch } from "@/components/HospitalSearch";
import { CompareHospitalPicker } from "@/components/CompareHospitalPicker";
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
  const [compareHospitals, setCompareHospitals] = useState<HospitalSummary[]>([]);
  const [trendMeasure, setTrendMeasure] = useState(COMPARISON_MEASURES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const skipCompareRefetch = useRef(false);

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

  const loadComparison = useCallback(
    async (hospital: HospitalSummary, compareIds: string[]) => {
      const [comp, tr] = await Promise.all([
        fetchComparison(hospital.facilityId, compareIds),
        fetchTrends(hospital.facilityId),
      ]);
      setComparison(comp);
      setTrend(tr);
    },
    [],
  );

  const loadHospital = useCallback(
    async (hospital: HospitalSummary) => {
      setSelected(hospital);
      setCompareHospitals([]);
      skipCompareRefetch.current = true;
      setLoading(true);
      setError(null);
      try {
        await loadComparison(hospital, []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comparison");
        setComparison(null);
        setTrend(null);
      } finally {
        setLoading(false);
      }
    },
    [loadComparison],
  );

  useEffect(() => {
    if (!selected || skipCompareRefetch.current) {
      skipCompareRefetch.current = false;
      return;
    }
    const ids = compareHospitals.map((h) => h.facilityId);
    setCompareLoading(true);
    loadComparison(selected, ids)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to update comparison");
      })
      .finally(() => setCompareLoading(false));
  }, [compareHospitals, selected, loadComparison]);

  const togglePeer = (key: string) => {
    setVisiblePeers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-700 text-white">
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
        <section className="relative overflow-hidden rounded-2xl border-2 border-indigo-300/40 bg-gradient-to-br from-indigo-50 via-white to-orange-50/30 p-6 shadow-xl shadow-indigo-900/5 ring-1 ring-indigo-200/50 sm:p-8 no-print">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-400/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-orange-300/10 blur-2xl" />
          <div className="relative mb-6 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-md">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Find your hospital</h2>
              <p className="mt-1 text-sm text-slate-600">
                Search by name, city, or ZIP — then compare HCAHPS patient experience and CDC NHSN
                infection measures against county, ZIP, state, and national peers.
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
          <div id="comparison-report" className="space-y-8">
            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-orange-50/50 to-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="print:block">
                  <p className="hidden text-xs font-semibold uppercase tracking-wide text-indigo-700 print:block">
                    {SITE_NAME} — Hospital Comparison Report
                  </p>
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
                <div className="flex flex-wrap items-center gap-3">
                  {selected.overallRating && (
                    <div className="rounded-xl border border-orange-200 bg-white px-5 py-3 text-center shadow-sm">
                      <div className="text-3xl font-bold" style={{ color: CHART.baseHospital }}>
                        {selected.overallRating}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        CMS overall stars
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={printReport}
                    className="no-print inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" />
                    Save as PDF
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <CompareHospitalPicker
                baseHospitalId={selected.facilityId}
                selected={compareHospitals}
                onChange={setCompareHospitals}
              />

              {compareLoading && (
                <div className="flex items-center gap-2 text-sm text-indigo-700">
                  <Loader2 className="h-4 w-4 animate-spin" /> Updating comparison…
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 no-print">
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
                        ? "bg-indigo-700 text-white"
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

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm no-print">
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
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm no-print">
          <div className="mb-4 flex items-center gap-2">
            <Info className="h-5 w-5 text-indigo-700" />
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
                  className="flex shrink-0 items-center gap-1 text-indigo-700 hover:underline"
                >
                  {src.agency} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 no-print">
        <p>
          <span className="font-medium text-slate-500">Parigrado.com</span> · Public CMS &amp; CDC-reported
          data for informational purposes only. Not medical advice.
        </p>
      </footer>
    </div>
  );
}
