import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import { searchHospitals } from "@/lib/api";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

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
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by hospital name, city, or ZIP…"
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none ring-brand-500 focus:ring-2"
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm outline-none ring-brand-500 focus:ring-2"
        >
          <option value="">All states</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {results.map((h) => (
            <li key={h.facilityId}>
              <button
                type="button"
                onClick={() => onSelect(h)}
                className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-brand-50"
              >
                <span className="font-medium text-brand-900">{h.name}</span>
                <span className="text-sm text-slate-500">
                  {h.city}, {h.state} {h.zip} · {h.ownership}
                  {h.overallRating ? ` · ${h.overallRating}★ overall` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searchError && (
        <p className="text-sm text-amber-800">{searchError}</p>
      )}

      {query.length >= 2 && !loading && !searchError && results.length === 0 && (
        <p className="text-sm text-slate-500">
          No hospitals matched your search. Try a shorter name, city, or ZIP — CMS uses official
          facility names (e.g. Asheville&apos;s Mission Hospital is listed as &quot;Memorial Mission
          Hospital&quot;).
        </p>
      )}
    </div>
  );
}
