import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import {
  addToWatchlist,
  isOnWatchlist,
  removeFromWatchlist,
} from "@/lib/watchlist";

interface Props {
  hospital: HospitalSummary;
}

export function WatchlistButton({ hospital }: Props) {
  const [onList, setOnList] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    setOnList(isOnWatchlist(hospital.facilityId));
  }, [hospital.facilityId]);

  const toggle = () => {
    if (onList) {
      removeFromWatchlist(hospital.facilityId);
      setOnList(false);
    } else {
      addToWatchlist({ facilityId: hospital.facilityId, name: hospital.name });
      setOnList(true);
      setShowNote(true);
      setTimeout(() => setShowNote(false), 5000);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`no-print inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition ${
          onList
            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        }`}
        title="Save to watchlist (stored in this browser)"
      >
        {onList ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {onList ? "On watchlist" : "Watch this hospital"}
      </button>
      {showNote && (
        <p className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg">
          Saved locally. Email alerts are coming soon — we&apos;ll notify you when CMS publishes new
          scores for this hospital.
        </p>
      )}
    </div>
  );
}
