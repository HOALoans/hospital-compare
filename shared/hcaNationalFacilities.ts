import seed from "./hca-national-facilities.json" with { type: "json" };
import { HCA_NC_FACILITY_IDS } from "./hcaNcFacilities.js";

/**
 * National HCA Healthcare acute-care CCN roster for the National HCA tab.
 * Seed list is CMS name-pattern + curated markets; refresh from AHRQ via
 * `scripts/extractHcaFromAhrq.ts` when a Compendium hospital linkage CSV is available.
 */
export const HCA_NATIONAL_SOURCE = String(seed.source ?? "");
export const HCA_NATIONAL_AS_OF = String(seed.asOf ?? "");

const fromSeed = Array.isArray(seed.facilityIds)
  ? seed.facilityIds.map((id) => String(id).padStart(6, "0"))
  : [];

/** Deduped, sorted CCNs (seed ∪ NC Mission Health). */
export const HCA_NATIONAL_FACILITY_IDS: string[] = [
  ...new Set([...fromSeed, ...HCA_NC_FACILITY_IDS.map(String)]),
].sort();

export const HCA_NATIONAL_FACILITY_ID_SET = new Set(HCA_NATIONAL_FACILITY_IDS);

export const HCA_PEER_KEY_ALL = "hca:all";

export function isHcaNationalFacility(facilityId: string): boolean {
  return HCA_NATIONAL_FACILITY_ID_SET.has(facilityId);
}
