import { useEffect, useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import { US_STATES } from "@shared/usStates";
import { searchHospitals } from "@/lib/api";
import { HospitalLogo } from "@/components/HospitalLogo";

interface Props {
  onSelect: (hospital: HospitalSummary) => void;
}

export function HospitalSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [results, setResults] = useState<HospitalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const data = await searchHospitals(query, state || undefined);
        setResults(data.hospitals);
      } catch (err) {
        setResults([]);
        setSearchError(
          err instanceof Error ? err.message : "Search is temporarily unavailable.",
        );
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, state]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-teal-600/20 bg-white p-3 shadow-md sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-700" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by hospital name, city, or ZIP…"
              className="w-full rounded-xl border-2 border-teal-100 bg-white py-3.5 pl-12 pr-4 text-base font-medium text-slate-900 shadow-inner outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            />
          </div>
          <div className="relative sm:w-36">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700" />
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full appearance-none rounded-xl border-2 border-teal-100 bg-white py-3.5 pl-9 pr-8 text-base font-medium text-slate-900 shadow-inner outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            >
              <option value="">All states</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm font-medium text-teal-800">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching hospitals…
        </div>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border-2 border-teal-100 bg-white shadow-md">
          {results.map((h) => (
            <li key={h.facilityId}>
              <button
                type="button"
                onClick={() => onSelect(h)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-teal-50"
              >
                <HospitalLogo hospital={h} size={36} />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900">{h.name}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">
                    {h.city}, {h.state} {h.zip} · {h.ownership}
                    {h.overallRating ? ` · ${h.overallRating}★ overall` : ""}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searchError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {searchError}
        </p>
      )}

      {query.length >= 2 && !loading && !searchError && results.length === 0 && (
        <p className="text-sm text-slate-600">
          No hospitals matched your search. Try a shorter name, city, or ZIP — CMS uses official
          facility names (e.g. Asheville&apos;s Mission Hospital is listed as &quot;Memorial Mission
          Hospital&quot;).
        </p>
      )}
    </div>
  );
}
