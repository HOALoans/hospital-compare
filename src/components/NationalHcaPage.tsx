import { useEffect, useMemo, useState } from "react";
import { Building2, ExternalLink, Loader2, Search } from "lucide-react";
import {
  COMPARISON_MEASURES,
  MEASURE_CATEGORIES,
  formatGapValue,
  formatMeasureValue,
  getMeasureDefinition,
  type MeasureCategory,
} from "@shared/measures";
import { US_STATES } from "@shared/usStates";
import type { HcaNationalResponse } from "@shared/types";
import { fetchHcaNational } from "@/lib/api";
import { HospitalLogo } from "@/components/HospitalLogo";

interface Props {
  partnerQuery?: string;
  onOpenCompare: (facilityId: string) => void;
}

function signedGap(
  hca: number | null,
  national: number | null,
  higherIsBetter: boolean,
): number | null {
  if (hca === null || national === null) return null;
  return higherIsBetter ? hca - national : national - hca;
}

export function NationalHcaPage({ partnerQuery = "", onOpenCompare }: Props) {
  const [data, setData] = useState<HcaNationalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<MeasureCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHcaNational()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load HCA national data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const measureRows = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.measures.map((m) => [m.measureId, m]));
    return COMPARISON_MEASURES.filter(
      (def) => category === "all" || def.category === category,
    ).map((def) => {
      const row = byId.get(def.id);
      const gap = signedGap(
        row?.hcaAverage ?? null,
        row?.nationalAverage ?? null,
        def.higherIsBetter,
      );
      return { def, row, gap };
    });
  }, [data, category]);

  const hospitals = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.hospitals.filter((h) => {
      if (stateFilter && h.state !== stateFilter) return false;
      if (!q) return true;
      return (
        h.name.toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q) ||
        h.zip.includes(q) ||
        h.facilityId.includes(q)
      );
    });
  }, [data, query, stateFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading national HCA hospitals…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error ?? "No data"}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-primary/5 via-white to-brand-secondary/10 p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white shadow-md">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-slate-900 sm:text-3xl">National HCA</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              System-wide CMS quality averages for HCA Healthcare hospitals versus the U.S. national
              mean, plus a directory of individual facilities. Open any hospital in Compare for full
              peer benchmarks.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {data.matchedCount} of {data.rosterCount} roster hospitals matched in CMS · reporting
              period {data.period.start || "—"} – {data.period.end || "—"} · roster as of {data.asOf}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">HCA system averages vs national</h3>
            <p className="mt-1 text-sm text-slate-600">
              Gap is direction-adjusted (positive = HCA better than national on that measure).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                category === "all"
                  ? "bg-brand-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            {MEASURE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  category === cat.id
                    ? "bg-brand-primary text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.id === "patient-experience"
                  ? "Patient experience"
                  : cat.id === "infections"
                    ? "Infections"
                    : cat.id === "readmissions"
                      ? "Readmissions"
                      : cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Measure</th>
                <th className="px-2 py-2 font-semibold">HCA avg</th>
                <th className="px-2 py-2 font-semibold">National</th>
                <th className="px-2 py-2 font-semibold">Gap</th>
                <th className="px-2 py-2 font-semibold">HCA n</th>
              </tr>
            </thead>
            <tbody>
              {measureRows.map(({ def, row, gap }) => {
                const help = getMeasureDefinition(def.id);
                return (
                  <tr key={def.id} className="border-b border-slate-100">
                    <td className="px-2 py-2.5">
                      <div className="font-medium text-slate-900">{def.label}</div>
                      {help?.description && (
                        <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                          {help.description}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-slate-800">
                      {formatMeasureValue(row?.hcaAverage ?? null, def.valueType)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-slate-600">
                      {formatMeasureValue(row?.nationalAverage ?? null, def.valueType)}
                    </td>
                    <td
                      className={`px-2 py-2.5 tabular-nums font-medium ${
                        gap === null
                          ? "text-slate-400"
                          : gap > 0.0005
                            ? "text-emerald-700"
                            : gap < -0.0005
                              ? "text-rose-700"
                              : "text-slate-600"
                      }`}
                    >
                      {formatGapValue(gap, def.valueType)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-slate-500">
                      {row?.hcaHospitalCount ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-900">HCA hospitals</h3>
          <p className="mt-1 text-sm text-slate-600">
            Search the national roster, then open a facility in Compare.
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, city, ZIP, or CCN…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            aria-label="Filter by state"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <option value="">All states</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          Showing {hospitals.length} of {data.hospitals.length} matched hospitals
          {data.missingIds.length > 0
            ? ` · ${data.missingIds.length} roster IDs not in current CMS cache`
            : ""}
        </p>

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {hospitals.map((h) => (
            <li
              key={h.facilityId}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <HospitalLogo hospital={h} size={36} />
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{h.name}</div>
                  <div className="text-sm text-slate-600">
                    {h.city}, {h.state} {h.zip}
                    {h.overallRating ? ` · ${h.overallRating} CMS stars` : ""}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenCompare(h.facilityId)}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-brand-primary/30 bg-white px-3 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5"
              >
                Open in Compare
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {hospitals.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              No hospitals match this filter.
            </li>
          )}
        </ul>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          Roster source: {data.source}. Deep links use{" "}
          <code className="rounded bg-slate-100 px-1">/?view=compare&amp;hospital=…</code>
          {partnerQuery ? ` (partner preserved).` : "."}
        </p>
      </section>
    </div>
  );
}
