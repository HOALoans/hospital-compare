import { useEffect, useState } from "react";
import { MapPin, Loader2, Plus } from "lucide-react";
import type { HospitalSummary, NearbyHospital } from "@shared/types";
import { fetchNearbyHospitals } from "@/lib/api";
import { HospitalLogo } from "@/components/HospitalLogo";

interface Props {
  hospital: HospitalSummary;
  onSelect: (hospital: HospitalSummary) => void;
  onAddToCompare?: (hospital: HospitalSummary) => void;
}

export function NearbyHospitals({ hospital, onSelect, onAddToCompare }: Props) {
  const [nearby, setNearby] = useState<NearbyHospital[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchNearbyHospitals(hospital.facilityId)
      .then((data) => setNearby(data.nearby))
      .catch(() => setNearby([]))
      .finally(() => setLoading(false));
  }, [hospital.facilityId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Finding nearby hospitals…
      </div>
    );
  }

  if (nearby.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 no-print">
      <div className="mb-1 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-brand-primary" />
        <h3 className="text-sm font-semibold text-slate-900">Nearby hospitals (~25 mi)</h3>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        <span className="font-medium">Add</span> overlays a hospital on the charts.{" "}
        <span className="font-medium">Switch</span> replaces the hospital you are viewing.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {nearby.map((h) => (
          <li key={h.facilityId}>
            <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
              <HospitalLogo hospital={h} size={28} />
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium leading-snug text-slate-900" title={h.name}>
                  {h.name}
                </span>
                <span className="text-xs text-slate-500">
                  {h.city}, {h.state} · {h.distanceLabel}
                </span>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {onAddToCompare && (
                  <button
                    type="button"
                    onClick={() => onAddToCompare(h)}
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-brand-primary px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand-primary/90"
                    aria-label={`Add ${h.name} to comparison`}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(h)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  Switch
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
