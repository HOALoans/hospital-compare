/**
 * NC Mission Health acute-care hospitals owned by HCA Healthcare.
 * Used by the Compare "Load NC HCA (Mission Health)" preset (≤ MAX_COMPARE overlays).
 */
export const HCA_NC_BASE_FACILITY_ID = "340002";

/** Base hospital first, then sibling overlays (order is display order). */
export const HCA_NC_FACILITY_IDS = [
  "340002", // Memorial Mission Hospital — Asheville
  "340087", // Mission Hospital McDowell — Marion
  "341326", // Angel Medical Center — Franklin
  "341329", // Blue Ridge Regional Hospital — Spruce Pine
  "341316", // Highlands-Cashiers Hospital — Highlands
  "341319", // Transylvania Regional Hospital — Brevard
] as const;

export const HCA_NC_OVERLAY_FACILITY_IDS = HCA_NC_FACILITY_IDS.filter(
  (id) => id !== HCA_NC_BASE_FACILITY_ID,
);

export const HCA_NC_PRESET_LABEL = "Load NC HCA (Mission Health)";

export const HCA_NC_PRESET_NOTE =
  "NC Mission Health acute-care hospitals owned by HCA (Asheville + WNC campuses).";
