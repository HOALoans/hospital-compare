import type { HospitalSummary } from "@shared/types";

export interface CompareUrlState {
  view: "home" | "compare" | "methodology";
  hospitalId?: string;
  compareWith: string[];
  peers: string[];
  stateFilter: string;
  groupFilter: string;
}

const DEFAULT_PEERS = [
  "county-all",
  "county-for-profit",
  "county-non-profit",
  "zip3-all",
  "state-all",
  "national",
];

export function parseUrlState(search: string): CompareUrlState {
  const params = new URLSearchParams(search);
  const viewParam = params.get("view");
  const view =
    viewParam === "methodology" ? "methodology" : viewParam === "compare" || params.get("hospital") ? "compare" : "home";

  const compareWith = (params.get("compare") ?? params.get("compareWith") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const peersParam = params.get("peers");
  const peers = peersParam
    ? peersParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_PEERS];

  return {
    view,
    hospitalId: params.get("hospital") ?? undefined,
    compareWith,
    peers,
    stateFilter: params.get("state") ?? "",
    groupFilter: params.get("category") ?? "all",
  };
}

export function buildUrlState(state: {
  view: "home" | "compare" | "methodology";
  hospital?: HospitalSummary | null;
  compareHospitals?: HospitalSummary[];
  visiblePeers?: Set<string>;
  stateFilter?: string;
  groupFilter?: string;
}): string {
  const params = new URLSearchParams();

  if (state.view === "home") return "";
  params.set("view", state.view);

  if (state.hospital) {
    params.set("hospital", state.hospital.facilityId);
  }

  const compareIds = state.compareHospitals?.map((h) => h.facilityId) ?? [];
  if (compareIds.length > 0) {
    params.set("compare", compareIds.join(","));
  }

  if (state.visiblePeers) {
    const peerList = [...state.visiblePeers].sort();
    const defaultSet = new Set(DEFAULT_PEERS);
    const isDefault =
      peerList.length === DEFAULT_PEERS.length && peerList.every((p) => defaultSet.has(p));
    if (!isDefault) {
      params.set("peers", peerList.join(","));
    }
  }

  if (state.stateFilter) {
    params.set("state", state.stateFilter);
  }

  if (state.groupFilter && state.groupFilter !== "all") {
    params.set("category", state.groupFilter);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function syncUrl(state: Parameters<typeof buildUrlState>[0], replace = true) {
  const path = buildUrlState(state);
  const url = `${window.location.pathname}${path}`;
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}
