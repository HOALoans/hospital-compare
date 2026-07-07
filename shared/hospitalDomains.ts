import type { HospitalSummary } from "./types.js";

/**
 * CMS Hospital General Information does not include website URLs.
 * Curated facility ID → domain mapping for favicon/logo display.
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
  "360180": "clevelandclinic.org",
  "240010": "mayoclinic.org",
  "520023": "mayoclinic.org",
  "030024": "mayoclinic.org",
  "210002": "hopkinsmedicine.org",
  "360096": "mountsinai.org",
  "330154": "nyp.org",
  "340113": "atriumhealth.org",
  "340030": "dukehealth.org",
  "340014": "unchealth.org",
  "050302": "kaiserpermanente.org",
  "390048": "mercy.com",
  "220039": "massgeneral.org",
};

/** CMS Hospital Compare profile page for a facility. */
export function getCmsProfileUrl(facilityId: string): string {
  return `https://www.medicare.gov/care-compare/details/hospital/${facilityId}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

/**
 * Infer a likely hospital domain from name + city when not in curated map.
 * Conservative: only for well-formed nonprofit / health system names.
 */
export function inferHospitalDomain(hospital: HospitalSummary): string | null {
  const name = hospital.name.toLowerCase();
  const city = hospital.city.toLowerCase().replace(/[^a-z]/g, "");

  // "X Health" / "X Healthcare" / "X Medical Center"
  const healthMatch = name.match(/^([\w\s&.-]+?)\s+(healthcare|health|medical center|hospital)/i);
  if (healthMatch) {
    const base = slugify(healthMatch[1]);
    if (base.length >= 4) return `${base}health.org`;
  }

  // City + hospital pattern: "Memorial Hospital" in Asheville → memorialasheville.org unlikely
  // Safer: cityhospital.org for "City Hospital"
  if (name.includes("hospital") && city.length >= 4) {
    const prefix = slugify(name.split(" hospital")[0] ?? "");
    if (prefix.length >= 4) return `${prefix}${city}.org`;
  }

  return null;
}

export function getHospitalDomain(hospital: HospitalSummary): string | null {
  return HOSPITAL_DOMAINS[hospital.facilityId] ?? inferHospitalDomain(hospital);
}

export function getHospitalFaviconUrl(hospital: HospitalSummary, size = 64): string | null {
  const domain = getHospitalDomain(hospital);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function isCuratedDomain(facilityId: string): boolean {
  return facilityId in HOSPITAL_DOMAINS;
}
