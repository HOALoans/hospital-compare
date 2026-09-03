import type { HospitalSummary } from "@shared/types";

export type AppUrlView = "home" | "compare" | "methodology" | "admin" | "hca-national" | "pricing";

export interface CompareUrlState {
  view: AppUrlView;
  hospitalId?: string;
  compareWith: string[];
  peers: string[];
  stateFilter: string;
  groupFilter: string;
  partner?: string;
  /** Short code from a server-saved comparison (?saved=abc12345). */
  savedCode?: string;
}

/** No benchmarks on by default — user opts into National / State / County (and advanced peers). */
const DEFAULT_PEERS: string[] = [];

export function parseUrlState(
  search: string,
  pathname: string = typeof window !== "undefined" ? window.location.pathname : "/",
): CompareUrlState {
  const params = new URLSearchParams(search);
  const path = pathname.replace(/\/+$/, "") || "/";
  const isAdminPath = path === "/admin";

  const viewParam = params.get("view");
  const view: CompareUrlState["view"] = isAdminPath
    ? "admin"
    : viewParam === "admin"
      ? "admin"
      : viewParam === "methodology"
        ? "methodology"
        : viewParam === "hca-national"
          ? "hca-national"
          : viewParam === "pricing"
            ? "pricing"
          : viewParam === "compare" || params.get("hospital") || params.get("saved")
            ? "compare"
            : "home";

  const compareWith = (params.get("compare") ?? params.get("compareWith") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const peersParam = params.get("peers");
  const peers = peersParam
    ? peersParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_PEERS];

  const partner = params.get("partner") ?? undefined;
  const savedCode = params.get("saved")?.trim().toLowerCase() || undefined;

  return {
    view,
    hospitalId: params.get("hospital") ?? undefined,
    compareWith,
    peers,
    stateFilter: params.get("state") ?? "",
    groupFilter: params.get("category") ?? "all",
    partner,
    savedCode,
  };
}

export function buildUrlState(state: {
  view: AppUrlView;
  hospital?: HospitalSummary | null;
  compareHospitals?: HospitalSummary[];
  visiblePeers?: Set<string>;
  stateFilter?: string;
  groupFilter?: string;
  partner?: string;
  savedCode?: string;
}): { pathname: string; search: string } {
  const params = new URLSearchParams();

  if (state.view === "admin") {
    return { pathname: "/admin", search: "" };
  }

  if (state.partner) {
    params.set("partner", state.partner);
  }

  if (state.view === "home") {
    const qs = params.toString();
    return { pathname: "/", search: qs ? `?${qs}` : "" };
  }

  if (state.savedCode) {
    params.set("saved", state.savedCode);
    const qs = params.toString();
    return { pathname: "/", search: qs ? `?${qs}` : "" };
  }

  params.set("view", state.view);

  if (state.view === "hca-national" || state.view === "pricing") {
    const qs = params.toString();
    return { pathname: "/", search: qs ? `?${qs}` : "" };
  }

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
  return { pathname: "/", search: qs ? `?${qs}` : "" };
}

export function syncUrl(state: Parameters<typeof buildUrlState>[0], replace = true) {
  const { pathname, search } = buildUrlState(state);
  const url = `${pathname}${search}`;
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}
