import type { HospitalSummary } from "./types.js";

/**
 * CMS Hospital General Information does not include website URLs.
 * Curated facility ID → domain mapping for favicon/logo display.
 * Expand over time as hospitals are verified.
 */
export const HOSPITAL_DOMAINS: Record<string, string> = {
  "340002": "missionhealth.org",
  "340087": "missionhealth.org",
  "360079": "nyulangone.org",
  "050001": "uabmedicine.org",
  "210009": "ukhealthcare.uky.edu",
  "140008": "emoryhealthcare.org",
  "220071": "ochsner.org",
  "450001": "houstonmethodist.org",
  "060024": "ucsfhealth.org",
  "050464": "stanfordhealthcare.org",
};

export function getHospitalDomain(hospital: HospitalSummary): string | null {
  return HOSPITAL_DOMAINS[hospital.facilityId] ?? null;
}

export function getHospitalFaviconUrl(hospital: HospitalSummary, size = 64): string | null {
  const domain = getHospitalDomain(hospital);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
