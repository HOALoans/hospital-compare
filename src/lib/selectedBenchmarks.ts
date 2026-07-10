import type { ComparisonResult } from "@shared/types";
import { CHART } from "@shared/chartTheme";

export const NATIONAL_KEY = "national";
export const STATE_KEY = "state-all";
export const COUNTY_KEY = "county-all";
export const DEDICATED_PEER_KEYS = new Set([NATIONAL_KEY, STATE_KEY, COUNTY_KEY]);

/** A benchmark marker/column shared by the overview summary and the drill-down. */
export interface SelectedBenchmark {
  key: string;
  /** Full label used in tooltips / score cards. */
  label: string;
  /** Compact label used in the chart key. */
  shortLabel: string;
  color: string;
  /** Dots for the core benchmarks, diamonds for ownership/ZIP peer groups. */
  shape: "dot" | "diamond";
  scores: Record<string, number | null>;
}

/**
 * Single source of truth for which benchmarks the user has toggled on.
 *
 * The drill-down bar (buildMarkers), the drill-down chart key + score cards, and
 * the overview summary all read from this so a selected custom benchmark (e.g.
 * "NC — For-profit") shows up everywhere — never as an orphan dot on the bar
 * with no legend entry, and never missing from the overview.
 */
export function selectedBenchmarks(
  comparison: ComparisonResult,
  visiblePeerKeys: Set<string>,
): SelectedBenchmark[] {
  const out: SelectedBenchmark[] = [];

  if (visiblePeerKeys.has(NATIONAL_KEY)) {
    out.push({
      key: NATIONAL_KEY,
      label: "National",
      shortLabel: "National",
      color: CHART.national,
      shape: "dot",
      scores: comparison.nationalScores,
    });
  }
  if (visiblePeerKeys.has(STATE_KEY)) {
    out.push({
      key: STATE_KEY,
      label: comparison.hospital.state,
      shortLabel: "State",
      color: CHART.state,
      shape: "dot",
      scores: comparison.stateScores,
    });
  }
  if (visiblePeerKeys.has(COUNTY_KEY)) {
    out.push({
      key: COUNTY_KEY,
      label: "County",
      shortLabel: "County",
      color: CHART.county,
      shape: "dot",
      scores: comparison.countyScores,
    });
  }

  // Custom ownership / ZIP peer groups the user turned on under "More benchmarks".
  for (const peer of comparison.peers) {
    if (DEDICATED_PEER_KEYS.has(peer.groupKey)) continue;
    if (!visiblePeerKeys.has(peer.groupKey)) continue;
    out.push({
      key: peer.groupKey,
      label: peer.label,
      shortLabel: peer.label,
      color: CHART.peerGroup,
      shape: "diamond",
      scores: peer.scores,
    });
  }

  return out;
}
