import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bookmark,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  Download,
  Home,
  Loader2,
  Printer,
} from "lucide-react";
import type { ComparisonResult, HospitalSummary, HospitalTrend } from "@shared/types";
import {
  COMPARISON_MEASURES,
  SITE_TAGLINE,
  type MeasureCategory,
} from "@shared/measures";
import { OWNERSHIP_LABELS } from "@shared/ownership";
import { CHART } from "@shared/chartTheme";
import { fetchComparison, fetchHealth, fetchHospital, fetchSavedComparison, fetchTrends, saveComparisonForLater } from "@/lib/api";
import { downloadComparisonCsv } from "@/lib/exportComparisonCsv";
import { parseUrlState, syncUrl } from "@/lib/urlState";
import { usePartner } from "@/context/PartnerContext";
import { HospitalSearch } from "@/components/HospitalSearch";
import { CompareHospitalPicker, MAX_COMPARE } from "@/components/CompareHospitalPicker";
import { ComparisonTable } from "@/components/ComparisonTable";
import { TrendChart } from "@/components/TrendChart";
import { HomePage } from "@/components/HomePage";
import { HospitalLogo } from "@/components/HospitalLogo";
import { ComparisonSummary } from "@/components/ComparisonSummary";
import { DataFreshnessBadge } from "@/components/DataFreshnessBadge";
import { NearbyHospitals } from "@/components/NearbyHospitals";
import { WatchlistButton } from "@/components/WatchlistButton";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { SaveComparisonPanel } from "@/components/SaveComparisonPanel";
import { PrintComparisonReport } from "@/components/PrintComparisonReport";
import { MethodologyPage } from "@/components/MethodologyPage";
import { PartnerAdminPage } from "@/components/PartnerAdminPage";
import { SiteDisclaimer } from "@/components/SiteDisclaimer";

type AppView = "home" | "compare" | "methodology" | "admin";

const CORE_PEER_KEYS = new Set(["national", "state-all", "county-all"]);

function peerToggleColor(groupKey: string): string {
  if (groupKey === "national") return CHART.national;
  if (groupKey === "state-all") return CHART.state;
  if (groupKey === "county-all") return CHART.county;
  return CHART.peerGroup;
}

export default function App() {
  const { partner, partnerId } = usePartner();
  // Capture the URL state ONCE on first mount. Recomputing this every render
  // is unsafe because the URL-sync effect below rewrites window.location before
  // the deep-link restore effect runs — which would drop the hospital param and
  // leave the Compare page blank for shared/bookmarked links.
  const [initialUrl] = useState(() =>
    parseUrlState(window.location.search, window.location.pathname),
  );
  const [view, setView] = useState<AppView>(initialUrl.view);
  const searchSectionRef = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [directoryReady, setDirectoryReady] = useState(false);
  const [lastCacheRefresh, setLastCacheRefresh] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<HospitalSummary | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [trend, setTrend] = useState<HospitalTrend | null>(null);
  const [compareTrends, setCompareTrends] = useState<HospitalTrend[]>([]);
  const [trendYears, setTrendYears] = useState(10);
  const [categoryFilter, setCategoryFilter] = useState<MeasureCategory | "all">(
    (initialUrl.groupFilter as MeasureCategory | "all") || "all",
  );
  const [searchStateFilter, setSearchStateFilter] = useState(initialUrl.stateFilter);
  const [visiblePeers, setVisiblePeers] = useState<Set<string>>(new Set(initialUrl.peers));
  const [showAdvancedPeers, setShowAdvancedPeers] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [compareHospitals, setCompareHospitals] = useState<HospitalSummary[]>([]);
  const [trendMeasure, setTrendMeasure] = useState(COMPARISON_MEASURES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [savedCode, setSavedCode] = useState(initialUrl.savedCode ?? "");
  const [saveLabel, setSaveLabel] = useState("");
  const [savedShareUrl, setSavedShareUrl] = useState<string | null>(null);
  const [savingComparison, setSavingComparison] = useState(false);
  const skipCompareRefetch = useRef(false);
  const urlRestored = useRef(false);
  /** True while a deep-link hospital restore fetch is still in flight. */
  const restoreInProgress = useRef(Boolean(initialUrl.hospitalId || initialUrl.savedCode));

  useEffect(() => {
    const poll = async () => {
      try {
        const health = await fetchHealth();
        setReady(health.ready);
        setDirectoryReady(health.directoryReady ?? health.ready);
        setLastCacheRefresh(health.lastCacheRefresh ?? null);
        if (!health.ready) setTimeout(poll, 3000);
      } catch {
        setTimeout(poll, 5000);
      }
    };
    poll();
  }, []);

  const loadComparison = useCallback(
    async (hospital: HospitalSummary, compareIds: string[]) => {
      const [comp, tr, cmpTrendResults] = await Promise.all([
        fetchComparison(hospital.facilityId, compareIds),
        fetchTrends(hospital.facilityId),
        Promise.allSettled(compareIds.map((id) => fetchTrends(id))),
      ]);
      setComparison(comp);
      setTrend({ ...tr, facilityId: tr.facilityId || hospital.facilityId });
      // Keep trends aligned to requested IDs; one failed fetch must not drop the rest
      setCompareTrends(
        cmpTrendResults.map((result, i) => {
          const facilityId = compareIds[i]!;
          if (result.status === "fulfilled") {
            return { ...result.value, facilityId: result.value.facilityId || facilityId };
          }
          return { facilityId, points: [] };
        }),
      );
    },
    [],
  );

  const clearSavedComparison = () => {
    setSavedCode("");
    setSavedShareUrl(null);
    setSaveLabel("");
  };

  const loadHospital = useCallback(
    async (hospital: HospitalSummary, compareIds?: string[]) => {
      setView("compare");
      setSelected(hospital);
      const ids = compareIds ?? compareHospitals.map((h) => h.facilityId);
      skipCompareRefetch.current = true;
      setLoading(true);
      setError(null);
      try {
        await loadComparison(hospital, ids);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comparison");
        setComparison(null);
        setTrend(null);
        setCompareTrends([]);
      } finally {
        setLoading(false);
      }
    },
    [loadComparison, compareHospitals],
  );

  // Restore state from URL on first ready
  useEffect(() => {
    if (!directoryReady || urlRestored.current) return;
    if (!initialUrl.savedCode && !initialUrl.hospitalId) return;
    urlRestored.current = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        let hospitalId = initialUrl.hospitalId;
        let compareIds = [...initialUrl.compareWith];
        let peers = [...initialUrl.peers];
        let stateFilter = initialUrl.stateFilter;
        let groupFilter = initialUrl.groupFilter;

        if (initialUrl.savedCode) {
          const saved = await fetchSavedComparison(initialUrl.savedCode);
          hospitalId = saved.hospitalId;
          compareIds = [...saved.compareWith];
          peers = saved.peers.length > 0 ? [...saved.peers] : peers;
          stateFilter = saved.stateFilter || stateFilter;
          groupFilter = saved.groupFilter || groupFilter;
          setSavedCode(saved.code);
          setSaveLabel(saved.label);
          setSavedShareUrl(saved.shareUrl);
        }

        if (!hospitalId) return;

        const hospital = await fetchHospital(hospitalId);

        const compareList: HospitalSummary[] = [];
        for (const id of compareIds) {
          try {
            compareList.push(await fetchHospital(id));
          } catch {
            /* skip missing */
          }
        }

        setSelected(hospital);
        setView(initialUrl.view === "methodology" ? "methodology" : "compare");
        if (stateFilter) setSearchStateFilter(stateFilter);
        if (groupFilter && groupFilter !== "all") {
          // URL "category" may be a measure group or a top-level category id.
          if (["patient-experience", "infections", "readmissions"].includes(groupFilter)) {
            setCategoryFilter(groupFilter as MeasureCategory);
          }
        }
        setCompareHospitals(compareList);
        setVisiblePeers(new Set(peers));
        skipCompareRefetch.current = true;
        await loadComparison(hospital, compareList.map((h) => h.facilityId));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not restore shared link";
        setError(message);
        // Drop a dead ?saved= code from the URL so the user can start fresh.
        if (initialUrl.savedCode) {
          setSavedCode("");
          setSavedShareUrl(null);
        }
      } finally {
        setLoading(false);
        restoreInProgress.current = false;
      }
    })();
  }, [directoryReady, initialUrl, loadComparison]);

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

  useEffect(() => {
    // Don't sync (and thereby overwrite) the URL while a deep-link hospital is
    // still pending restore. Otherwise we'd strip the ?hospital= param before
    // the restore effect reads it, blanking the Compare page on shared links.
    // Block URL sync until deep-link restore finishes so we don't strip ?hospital=
    // after urlRestored is set but before selected is populated.
    if (restoreInProgress.current && !selected) return;
    if (view === "admin") {
      syncUrl({ view: "admin" });
      return;
    }
    const urlPartner = partnerId ?? undefined;
    if (view === "home" && !selected) {
      syncUrl({ view: "home", partner: urlPartner });
      return;
    }
    syncUrl({
      view,
      hospital: selected,
      compareHospitals,
      visiblePeers,
      stateFilter: searchStateFilter,
      groupFilter: categoryFilter,
      partner: urlPartner,
      savedCode: savedCode || undefined,
    });
  }, [view, selected, compareHospitals, visiblePeers, searchStateFilter, categoryFilter, partnerId, savedCode]);

  const togglePeer = (key: string) => {
    setVisiblePeers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addToCompare = useCallback(
    (hospital: HospitalSummary) => {
      if (!selected) return;
      if (hospital.facilityId === selected.facilityId) return;
      setCompareHospitals((prev) => {
        if (prev.length >= MAX_COMPARE) return prev;
        if (prev.some((h) => h.facilityId === hospital.facilityId)) return prev;
        return [...prev, hospital];
      });
    },
    [selected],
  );

  const printReport = () => window.print();

  const exportCsv = () => {
    if (!comparison) return;
    downloadComparisonCsv(comparison, { visiblePeerKeys: visiblePeers });
  };

  const goToCompare = () => {
    setView("compare");
    requestAnimationFrame(() => {
      searchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goHome = () => {
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goMethodology = () => {
    setView("methodology");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goAdmin = () => {
    setView("admin");
    // Prefer the memorable path over ?view=admin
    window.history.pushState(null, "", "/admin");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keep the SPA in sync when the user hits back/forward (including /admin).
  useEffect(() => {
    const onPopState = () => {
      const next = parseUrlState(window.location.search, window.location.pathname);
      setView(next.view);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const shareLink = () => {
    syncUrl({
      view: "compare",
      hospital: selected,
      compareHospitals,
      visiblePeers,
      stateFilter: searchStateFilter,
      groupFilter: categoryFilter,
      partner: partnerId ?? undefined,
      savedCode: savedCode || undefined,
    });
  };

  const saveForLater = async () => {
    if (!selected) return;
    setSavingComparison(true);
    setError(null);
    try {
      const result = await saveComparisonForLater({
        code: savedCode || undefined,
        label: saveLabel.trim() || undefined,
        hospitalId: selected.facilityId,
        compareWith: compareHospitals.map((h) => h.facilityId),
        peers: [...visiblePeers],
        stateFilter: searchStateFilter,
        groupFilter: categoryFilter,
        partner: partnerId ?? undefined,
      });
      setSavedCode(result.code);
      setSaveLabel(result.label);
      setSavedShareUrl(result.shareUrl);
      syncUrl({
        view: "compare",
        hospital: selected,
        compareHospitals,
        visiblePeers,
        stateFilter: searchStateFilter,
        groupFilter: categoryFilter,
        partner: partnerId ?? undefined,
        savedCode: result.code,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save comparison");
    } finally {
      setSavingComparison(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white no-print">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          {view === "admin" ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl leading-tight text-slate-900">Parigrado</h1>
                <p className="text-sm text-slate-500">Partner program admin</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={goHome}
              className="flex items-center gap-3 text-left transition hover:opacity-90"
            >
              {partner.logoUrl ? (
                <img
                  src={partner.logoUrl}
                  alt={partner.logoAlt ?? partner.displayName}
                  className="h-10 max-w-[10rem] object-contain"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white">
                  <Activity className="h-5 w-5" />
                </div>
              )}
              <div>
                <h1 className="font-display text-2xl leading-tight text-slate-900">
                  {partner.displayName}
                </h1>
                <p className="text-sm text-slate-500">
                  {partner.tagline ?? SITE_TAGLINE}
                </p>
              </div>
            </button>
          )}
          <div className="flex items-center gap-3">
            {view !== "admin" && (
            <nav className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={goHome}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === "home"
                    ? "bg-white text-brand-primary shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Home className="h-4 w-4" />
                Home
              </button>
              <button
                type="button"
                onClick={goToCompare}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === "compare"
                    ? "bg-white text-brand-primary shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Building2 className="h-4 w-4" />
                Compare
              </button>
              <button
                type="button"
                onClick={goMethodology}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  view === "methodology"
                    ? "bg-white text-brand-primary shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                Methodology
              </button>
            </nav>
            )}
            {view !== "admin" && !ready && (
              <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {directoryReady
                  ? "Loading quality scores from CMS…"
                  : "Loading CMS hospital directory…"}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl space-y-8 px-4 py-8 sm:px-6">
        {view === "admin" && <PartnerAdminPage onExit={goHome} />}

        {view === "home" && <HomePage onStartCompare={goToCompare} />}

        {view === "methodology" && (
          <MethodologyPage onBack={goHome} onStartCompare={goToCompare} />
        )}

        {view === "compare" && (
          <>
            {!selected ? (
              <section
                ref={searchSectionRef}
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-primary/5 via-white to-brand-secondary/10 p-6 shadow-sm sm:p-8 no-print"
              >
                <div className="relative mb-5 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white shadow-md">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">Find your hospital</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Search by name, city, or ZIP to see quality scores vs county, state, and national peers.
                    </p>
                  </div>
                </div>
                <HospitalSearch
                  onSelect={(h) => {
                    setCompareHospitals([]);
                    clearSavedComparison();
                    loadHospital(h, []);
                  }}
                  initialState={searchStateFilter}
                />
              </section>
            ) : (
              <section
                ref={searchSectionRef}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 no-print"
              >
                <p className="text-sm text-slate-600">
                  Viewing{" "}
                  <span className="font-semibold text-slate-900">{selected.name}</span>
                </p>
                <details className="group">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-brand-primary hover:underline">
                    Change hospital
                  </summary>
                  <div className="mt-3 w-full min-w-[min(100%,28rem)] sm:min-w-[28rem]">
                    <HospitalSearch
                      onSelect={(h) => {
                        setCompareHospitals([]);
                        clearSavedComparison();
                        loadHospital(h, []);
                      }}
                      initialState={searchStateFilter}
                    />
                  </div>
                </details>
              </section>
            )}

            {!selected && !comparison && !loading && !error && !initialUrl.savedCode && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center no-print">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Search and select a hospital above to start comparing
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                  Pick any Medicare-certified hospital for a scorecard summary, then drill into
                  individual measures.
                </p>
              </div>
            )}

            {(loading || (Boolean(initialUrl.savedCode) && !selected && !error)) && (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                {initialUrl.savedCode ? "Opening saved comparison…" : "Building comparison…"}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            {comparison && selected && !loading && (
              <>
                <PrintComparisonReport comparison={comparison} />
                <div id="comparison-report" className="space-y-6 print:hidden">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <HospitalLogo hospital={selected} size={48} showProfileLink />
                        <div>
                          <h2 className="font-display text-3xl text-slate-900">{selected.name}</h2>
                          <p className="mt-1 text-slate-600">
                            {selected.city}, {selected.state} {selected.zip} · {selected.county}{" "}
                            County
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            {selected.hospitalType} · {selected.ownership} (
                            {OWNERSHIP_LABELS[selected.ownershipGroup]})
                          </p>
                          <div className="mt-2">
                            <DataFreshnessBadge
                              periodStart={comparison.period.start}
                              periodEnd={comparison.period.end}
                              lastCacheRefresh={lastCacheRefresh}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {selected.overallRating && (
                          <div className="rounded-xl border border-orange-200 bg-orange-50/50 px-5 py-3 text-center">
                            <div className="text-3xl font-bold" style={{ color: CHART.baseHospital }}>
                              {selected.overallRating}
                            </div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">
                              CMS overall stars
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <WatchlistButton hospital={selected} />
                          <ShareLinkButton onCopy={shareLink} />
                          <button
                            type="button"
                            onClick={() => setShowSavePanel((v) => !v)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            <Bookmark className="h-4 w-4" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={exportCsv}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            <Download className="h-4 w-4" />
                            CSV
                          </button>
                          <button
                            type="button"
                            onClick={printReport}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-primary/90"
                          >
                            <Printer className="h-4 w-4" />
                            PDF
                          </button>
                        </div>
                      </div>
                    </div>
                    {showSavePanel && (
                      <div className="mt-4">
                        <SaveComparisonPanel
                          label={saveLabel}
                          onLabelChange={setSaveLabel}
                          shareUrl={savedShareUrl}
                          saving={savingComparison}
                          disabled={!selected}
                          onSave={saveForLater}
                        />
                      </div>
                    )}
                  </section>

                  <ComparisonSummary
                    comparison={comparison}
                    compareHospitals={compareHospitals}
                    onSelectCategory={(id) => setCategoryFilter(id as MeasureCategory)}
                  />

                  <div className="space-y-3 no-print">
                    <CompareHospitalPicker
                      baseHospitalId={selected.facilityId}
                      selected={compareHospitals}
                      onChange={setCompareHospitals}
                    />
                    <NearbyHospitals
                      hospital={selected}
                      onSelect={(h) => {
                        setCompareHospitals([]);
                        clearSavedComparison();
                        loadHospital(h, []);
                      }}
                      onAddToCompare={addToCompare}
                    />
                  </div>

                  {compareLoading && (
                    <div className="flex items-center gap-2 text-sm text-brand-primary">
                      <Loader2 className="h-4 w-4 animate-spin" /> Updating comparison…
                    </div>
                  )}

                  <section className="space-y-3 no-print">
                    <div className="flex flex-wrap items-center gap-2">
                      {comparison.peers
                        .filter((peer) => CORE_PEER_KEYS.has(peer.groupKey))
                        .map((peer) => {
                          const active = visiblePeers.has(peer.groupKey);
                          const color = peerToggleColor(peer.groupKey);
                          const short =
                            peer.groupKey === "national"
                              ? "National"
                              : peer.groupKey === "state-all"
                                ? "State"
                                : "County";
                          return (
                            <button
                              key={peer.groupKey}
                              type="button"
                              onClick={() => togglePeer(peer.groupKey)}
                              aria-pressed={active}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                active
                                  ? "border-transparent bg-brand-primary text-white shadow-sm"
                                  : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
                              }`}
                            >
                              {active ? (
                                <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
                              ) : (
                                <span className="h-3 w-3 shrink-0 rounded-full border-2 border-slate-300" />
                              )}
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              {short}
                            </button>
                          );
                        })}
                      <button
                        type="button"
                        onClick={() => setShowAdvancedPeers((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        More benchmarks
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition ${showAdvancedPeers ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {showAdvancedPeers && (
                      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        {comparison.peers
                          .filter((peer) => !CORE_PEER_KEYS.has(peer.groupKey))
                          .map((peer) => {
                            const active = visiblePeers.has(peer.groupKey);
                            const color = peerToggleColor(peer.groupKey);
                            return (
                              <button
                                key={peer.groupKey}
                                type="button"
                                onClick={() => togglePeer(peer.groupKey)}
                                aria-pressed={active}
                                title={peer.label}
                                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                  active
                                    ? "border-transparent bg-slate-800 text-white"
                                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="truncate">{peer.label}</span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </section>

                  <ComparisonTable
                    comparison={comparison}
                    categoryFilter={categoryFilter}
                    onCategoryChange={setCategoryFilter}
                    visiblePeerKeys={visiblePeers}
                  />

                  <section className="rounded-2xl border border-slate-200 bg-white no-print">
                    <button
                      type="button"
                      onClick={() => setShowTrends((v) => !v)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={showTrends}
                    >
                      <span className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-brand-primary" />
                        <span className="text-lg font-semibold text-slate-900">Historical trends</span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-slate-400 transition ${showTrends ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showTrends && (
                      <div className="space-y-4 border-t border-slate-100 px-5 py-5">
                        <p className="text-sm text-slate-600">
                          Year-over-year scores from CMS archived hospital snapshots (2019–2026).
                          Each bar group is one CMS release year; missing years mean that archive
                          has not finished importing yet.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <select
                            value={trendMeasure}
                            onChange={(e) => setTrendMeasure(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            {COMPARISON_MEASURES.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            Years shown
                            <select
                              value={trendYears}
                              onChange={(e) => setTrendYears(Number(e.target.value))}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                  {n === 1 ? "Last year" : `Last ${n} years`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {trend && (
                          <TrendChart
                            trend={trend}
                            compareTrends={compareTrends}
                            compareHospitals={comparison.compareHospitals}
                            baseHospitalName={selected.name}
                            selectedMeasureId={trendMeasure}
                            facilityId={selected.facilityId}
                            maxYears={trendYears}
                          />
                        )}
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
          </>
        )}

      </main>

      <SiteDisclaimer onOpenAdmin={goAdmin} showAdminLink={view !== "admin"} />
    </div>
  );
}
