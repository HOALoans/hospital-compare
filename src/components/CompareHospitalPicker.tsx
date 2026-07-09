import { useEffect, useState } from "react";
import { Plus, Search, X, Loader2, MapPin, MousePointerSquareDashed } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import { individualHospitalColor } from "@shared/chartTheme";
import { US_STATES } from "@shared/usStates";
import { searchHospitals } from "@/lib/api";
import { HospitalLogo } from "@/components/HospitalLogo";

export const MAX_COMPARE = 10;

/** MIME type used to carry a serialized HospitalSummary during drag-and-drop. */
export const HOSPITAL_DRAG_MIME = "application/x-hospital-compare";

/** Serialize a hospital onto a drag event for the compare drop zone. */
export function setHospitalDragData(e: React.DragEvent, hospital: HospitalSummary) {
  const payload = JSON.stringify(hospital);
  e.dataTransfer.setData(HOSPITAL_DRAG_MIME, payload);
  e.dataTransfer.setData("application/json", payload);
  e.dataTransfer.setData("text/plain", payload);
  e.dataTransfer.effectAllowed = "copy";
}

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
  const [dragOver, setDragOver] = useState(false);
  const [dropFeedback, setDropFeedback] = useState<{ tone: "ok" | "warn"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!dropFeedback) return;
    const timer = setTimeout(() => setDropFeedback(null), 2800);
    return () => clearTimeout(timer);
  }, [dropFeedback]);

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

  /** Add a dropped/clicked hospital, enforcing base/duplicate/max constraints. */
  const tryAddDropped = (hospital: HospitalSummary): boolean => {
    if (!hospital?.facilityId) return false;
    if (hospital.facilityId === baseHospitalId) {
      setDropFeedback({ tone: "warn", text: "That's already your base hospital." });
      return false;
    }
    if (selected.some((h) => h.facilityId === hospital.facilityId)) {
      setDropFeedback({ tone: "warn", text: `${hospital.name} is already in the comparison.` });
      return false;
    }
    if (selected.length >= MAX_COMPARE) {
      setDropFeedback({ tone: "warn", text: `You can compare up to ${MAX_COMPARE} hospitals.` });
      return false;
    }
    onChange([...selected, hospital]);
    setDropFeedback({ tone: "ok", text: `Added ${hospital.name} to the comparison.` });
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw =
      e.dataTransfer.getData(HOSPITAL_DRAG_MIME) ||
      e.dataTransfer.getData("application/json") ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      tryAddDropped(JSON.parse(raw) as HospitalSummary);
    } catch {
      /* ignore malformed drops */
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (!types.includes(HOSPITAL_DRAG_MIME) && !types.includes("application/json")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`no-print space-y-3 rounded-xl border p-4 transition ${
        dragOver
          ? "border-2 border-dashed border-indigo-500 bg-indigo-100/70 ring-2 ring-indigo-300"
          : "border-indigo-200/80 bg-indigo-50/40"
      }`}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={selected.length >= MAX_COMPARE}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none no-print"
        >
          <Plus className="h-4 w-4" />
          {open ? "Close search" : "Add hospital to compare"}
        </button>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Compare hospitals</h3>
          <p className="text-xs text-slate-600">
            Overlay up to {MAX_COMPARE} hospitals on every chart
            <span className="ml-1 font-semibold text-brand-primary">
              ({selected.length}/{MAX_COMPARE})
            </span>
          </p>
        </div>
      </div>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((h, i) => (
            <li
              key={h.facilityId}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-white bg-white py-1 pl-1.5 pr-1.5 text-xs shadow-sm"
            >
              <HospitalLogo hospital={h} size={24} />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: individualHospitalColor(i) }}
              />
              <span className="line-clamp-2 max-w-[14rem] font-medium leading-snug text-slate-800" title={h.name}>
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
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-indigo-50"
                  >
                    <HospitalLogo hospital={h} size={28} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-900">{h.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {h.city}, {h.state} {h.zip}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dropFeedback && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            dropFeedback.tone === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {dropFeedback.text}
        </p>
      )}

      <div
        className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs no-print transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
            : "border-indigo-200 text-slate-500"
        }`}
      >
        <MousePointerSquareDashed className="h-3.5 w-3.5" />
        Drag a nearby hospital here to compare
      </div>
    </div>
  );
}
