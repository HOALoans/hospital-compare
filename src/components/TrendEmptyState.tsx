import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ARCHIVE_YEARS } from "@shared/measures";
import { fetchArchiveMeta } from "@/lib/api";

interface Props {
  facilityId: string;
  hasTrendData: boolean;
}

export function TrendEmptyState({ facilityId, hasTrendData }: Props) {
  const [meta, setMeta] = useState<{
    ingestedHospitalCount: number;
    totalHospitalCount: number;
    estimatedYearProgress: number;
    estimatedYearsTotal: number;
  } | null>(null);

  useEffect(() => {
    if (hasTrendData) return;
    const poll = () => {
      fetchArchiveMeta()
        .then(setMeta)
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [facilityId, hasTrendData]);

  if (hasTrendData) return null;

  const yearLabel =
    meta && meta.estimatedYearProgress > 0
      ? `Loading year ${meta.estimatedYearProgress} of ${meta.estimatedYearsTotal}`
      : "Starting CMS archive import…";

  const progressPct =
    meta && meta.totalHospitalCount > 0
      ? Math.min(100, Math.round((meta.ingestedHospitalCount / meta.totalHospitalCount) * 100))
      : 0;

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" />
      <p className="text-sm font-medium text-slate-800">{yearLabel}</p>
      <p className="mt-2 text-sm text-slate-600">
        Historical trends use CMS archived hospital snapshots ({ARCHIVE_YEARS[0]}–
        {ARCHIVE_YEARS[ARCHIVE_YEARS.length - 1]}). Charts appear as archives are ingested in the
        background.
      </p>
      {meta && meta.totalHospitalCount > 0 && (
        <div className="mx-auto mt-4 max-w-xs">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {meta.ingestedHospitalCount.toLocaleString()} of{" "}
            {meta.totalHospitalCount.toLocaleString()} hospital trend files ready
          </p>
        </div>
      )}
      <a
        href="https://data.cms.gov/provider-data/archived-data/hospitals"
        className="mt-4 inline-block text-sm text-indigo-700 underline"
        target="_blank"
        rel="noreferrer"
      >
        View CMS archives
      </a>
    </div>
  );
}
