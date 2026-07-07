import { useState } from "react";
import { Building2, ExternalLink } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import {
  getHospitalFaviconUrl,
  getCmsProfileUrl,
  isCuratedDomain,
} from "@shared/hospitalDomains";

interface Props {
  hospital: HospitalSummary;
  size?: number;
  className?: string;
  showProfileLink?: boolean;
}

export function HospitalLogo({ hospital, size = 32, className = "", showProfileLink = false }: Props) {
  const faviconUrl = getHospitalFaviconUrl(hospital, 64);
  const [failed, setFailed] = useState(false);
  const cmsUrl = getCmsProfileUrl(hospital.facilityId);
  const curated = isCuratedDomain(hospital.facilityId);

  const logo = !faviconUrl || failed ? (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Building2 style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  ) : (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-200 ${className}`}
      onError={() => setFailed(true)}
      title={curated ? "Verified logo domain" : "Inferred logo — confirm on CMS profile"}
    />
  );

  if (!showProfileLink) return logo;

  return (
    <div className="flex flex-col items-center gap-1">
      {logo}
      <a
        href={cmsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 hover:underline no-print"
      >
        CMS <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}
