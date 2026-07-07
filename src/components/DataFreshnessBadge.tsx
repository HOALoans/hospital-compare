import { Clock, Database } from "lucide-react";

interface Props {
  periodStart: string;
  periodEnd: string;
  lastCacheRefresh: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function DataFreshnessBadge({ periodStart, periodEnd, lastCacheRefresh }: Props) {
  return (
    <div className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
        <Database className="h-3.5 w-3.5 text-indigo-600" />
        CMS data: {periodStart || "—"} – {periodEnd || "—"}
      </span>
      {lastCacheRefresh && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-900 ring-1 ring-emerald-200">
          <Clock className="h-3.5 w-3.5" />
          Cached {formatDate(lastCacheRefresh)}
        </span>
      )}
    </div>
  );
}
