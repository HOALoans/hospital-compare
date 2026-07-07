import { useEffect, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import type { HospitalSummary, NearbyHospital } from "@shared/types";
import { fetchNearbyHospitals } from "@/lib/api";
import { HospitalLogo } from "@/components/HospitalLogo";

interface Props {
  hospital: HospitalSummary;
  onSelect: (hospital: HospitalSummary) => void;
}

export function NearbyHospitals({ hospital, onSelect }: Props) {
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
    <section className="rounded-xl border border-teal-200/80 bg-teal-50/30 p-4 no-print">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-teal-700" />
        <h3 className="text-sm font-semibold text-slate-900">Nearby hospitals (~25 mi)</h3>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Based on CMS coordinates when available; otherwise same county or ZIP prefix.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {nearby.map((h) => (
          <li key={h.facilityId}>
            <button
              type="button"
              onClick={() => onSelect(h)}
              className="flex w-full items-center gap-2 rounded-lg border border-white bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-teal-200 hover:bg-teal-50"
            >
              <HospitalLogo hospital={h} size={28} />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{h.name}</span>
                <span className="text-xs text-slate-500">
                  {h.city}, {h.state} · {h.distanceLabel}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
