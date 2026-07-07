/**
 * Common names patients use that differ from CMS facility_name.
 * Keyed by CMS facility_id.
 */
export const HOSPITAL_SEARCH_ALIASES: Record<string, string[]> = {
  // Mission Health (NC)
  "340002": ["mission hospital", "mission hospital asheville", "mission health", "mission health asheville", "memorial mission"],
  "340087": ["mission hospital mcdowell", "mission health mcdowell", "mission health marion"],
  // Common regional brands
  "360079": ["nyu langone", "nyu hospital", "nyu medical center"],
  "050001": ["uab hospital", "university of alabama hospital"],
  "210009": ["uk hospital", "university of kentucky hospital", "uk healthcare"],
  "140008": ["emory hospital", "emory university hospital"],
  "220071": ["ochsner main", "ochsner medical center"],
  "450001": ["houston methodist", "methodist hospital houston"],
  "060024": ["ucsf medical center", "ucsf hospital"],
  "050464": ["stanford hospital", "stanford health care"],
  // Cleveland Clinic
  "360180": ["cleveland clinic main", "cleveland clinic"],
  // Mayo
  "240010": ["mayo clinic rochester", "mayo rochester"],
  "520023": ["mayo clinic jacksonville"],
  "030024": ["mayo clinic phoenix"],
  // Johns Hopkins
  "210002": ["johns hopkins hospital", "hopkins hospital"],
  // Mass General
  "220039": ["mass general", "mgh", "massachusetts general"],
  // Kaiser
  "050302": ["kaiser permanente oakland", "kaiser oakland"],
  // Common Catholic / nonprofit systems
  "390048": ["mercy health cincinnati", "mercy hospital cincinnati"],
  "360096": ["mount sinai", "mount sinai hospital nyc"],
  "330154": ["ny presbyterian", "newyork presbyterian", "columbia presbyterian"],
  // Carolinas / Atrium
  "340113": ["atrium health", "carolinas medical center", "cmmc"],
  // Duke
  "340030": ["duke hospital", "duke university hospital"],
  // UNC
  "340014": ["unc hospital", "unc medical center", "unc health", "unc rex"],
};
