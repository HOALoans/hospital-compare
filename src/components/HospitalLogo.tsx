import { useState } from "react";
import { Building2 } from "lucide-react";
import type { HospitalSummary } from "@shared/types";
import { getHospitalFaviconUrl } from "@shared/hospitalDomains";

interface Props {
  hospital: HospitalSummary;
  size?: number;
  className?: string;
}

export function HospitalLogo({ hospital, size = 32, className = "" }: Props) {
  const faviconUrl = getHospitalFaviconUrl(hospital, 64);
  const [failed, setFailed] = useState(false);

  if (!faviconUrl || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Building2 style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    );
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-200 ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
