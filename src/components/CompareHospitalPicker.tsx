import { useEffect, useState } from "react";
import { Plus, Search, X, Loader2, MapPin } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import { individualHospitalColor } from "@shared/chartTheme";
import { US_STATES } from "@shared/usStates";
import { searchHospitals } from "@/lib/api";

const MAX_COMPARE = 10;

interface Props {
  baseHospitalId: string;
  selected: HospitalSummary[];
  onChange: (hospitals: HospitalSummary[]) => void;
}

export function CompareHospitalPicker({ baseHospitalId, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [results, setResults] = useState<HospitalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchHospitals(query, state || undefined);
        const selectedIds = new Set(selected.map((h) => h.facilityId));
        setResults(
          data.hospitals.filter(
            (h) => h.facilityId !== baseHospitalId && !selectedIds.has(h.facilityId),
          ),
        );
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, state, baseHospitalId, selected]);

  const addHospital = (hospital: HospitalSummary) => {
    if (selected.length >= MAX_COMPARE) return;
    onChange([...selected, hospital]);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const removeHospital = (facilityId: string) => {
    onChange(selected.filter((h) => h.facilityId !== facilityId));
  };

  return (
    <div className="space-y-3 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Compare with individual hospitals</h3>
          <p className="text-xs text-slate-600">
            Add up to {MAX_COMPARE} specific hospitals to overlay on every chart ({selected.length}/
            {MAX_COMPARE} selected)
          </p>
        </div>
        {selected.length < MAX_COMPARE && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 no-print"
          >
            <Plus className="h-3.5 w-3.5" /> Add hospital
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((h, i) => (
            <li
              key={h.facilityId}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-white bg-white py-1 pl-3 pr-1.5 text-xs shadow-sm"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: individualHospitalColor(i) }}
              />
              <span className="truncate font-medium text-slate-800" title={h.name}>
                {h.name}
              </span>
              <span className="shrink-0 text-slate-400">
                {h.city}, {h.state}
              </span>
              <button
                type="button"
                onClick={() => removeHospital(h.facilityId)}
                className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 no-print"
                aria-label={`Remove ${h.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && selected.length < MAX_COMPARE && (
        <div className="space-y-2 no-print">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hospital name, city, or ZIP…"
                className="w-full rounded-lg border border-indigo-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-indigo-500 focus:ring-2"
                autoFocus
              />
            </div>
            <div className="relative sm:w-32">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full appearance-none rounded-lg border border-indigo-200 bg-white py-2.5 pl-9 pr-8 text-sm outline-none ring-indigo-500 focus:ring-2"
                aria-label="Filter by state"
              >
                <option value="">All states</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-indigo-100 bg-white shadow-md">
              {results.map((h) => (
                <li key={h.facilityId}>
                  <button
                    type="button"
                    onClick={() => addHospital(h)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-indigo-50"
                  >
                    <span className="text-sm font-medium text-slate-900">{h.name}</span>
                    <span className="text-xs text-slate-500">
                      {h.city}, {h.state} {h.zip}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
