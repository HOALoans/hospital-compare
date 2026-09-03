/** Percentiles / quartiles for hospital-level charge distributions. */

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Linear interpolation percentile; `p` in 0–100. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const w = rank - lo;
  return s[lo]! * (1 - w) + s[hi]! * w;
}

export function empiricalPercentile(sortedAsc: number[], value: number): number | null {
  if (sortedAsc.length === 0) return null;
  let below = 0;
  for (const v of sortedAsc) {
    if (v < value) below += 1;
    else break;
  }
  return (below / sortedAsc.length) * 100;
}

export function quartileOf(value: number, p25: number | null, p50: number | null, p75: number | null): 1 | 2 | 3 | 4 | null {
  if (p25 == null || p50 == null || p75 == null) return null;
  if (value <= p25) return 1;
  if (value <= p50) return 2;
  if (value <= p75) return 3;
  return 4;
}

export function summarize(values: number[]) {
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
    p99: percentile(values, 99),
  };
}
