/**
 * Server-side finance helpers for the HCA Watchdog page.
 * Quote/chart: Yahoo Finance v8 chart (no API key).
 * Analysts: Yahoo quoteSummary when crumb works; StockAnalysis.com HTML fallback.
 */

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SYMBOL = "HCA";

export const CHART_RANGES = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "15m" },
  "1mo": { range: "1mo", interval: "1d" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "5y": { range: "5y", interval: "1wk" },
} as const;

export type ChartRangeKey = keyof typeof CHART_RANGES;

const chartCache = new Map<string, { expires: number; body: unknown }>();
let analystsCache: { expires: number; body: unknown } | null = null;

const CHART_TTL_MS = 60_000;
const ANALYSTS_TTL_MS = 15 * 60_000;

type YahooSession = { cookie: string; crumb: string; expires: number };
let yahooSession: YahooSession | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function yahooFetch(url: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": YAHOO_UA,
    Accept: "application/json,text/plain,*/*",
  };
  if (cookie) headers.Cookie = cookie;
  return fetch(url, { headers });
}

function mergeSetCookie(existing: string, res: Response): string {
  const raw = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  const jar = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const sc of raw) {
    const first = sc.split(";")[0] ?? "";
    const eq = first.indexOf("=");
    if (eq > 0) jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getYahooSession(): Promise<YahooSession | null> {
  const now = Date.now();
  if (yahooSession && yahooSession.expires > now) return yahooSession;

  try {
    let cookie = "";
    const fc = await yahooFetch("https://fc.yahoo.com/");
    cookie = mergeSetCookie(cookie, fc);
    const home = await yahooFetch("https://finance.yahoo.com/", cookie);
    cookie = mergeSetCookie(cookie, home);
    await sleep(150);
    const crumbRes = await yahooFetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      cookie,
    );
    cookie = mergeSetCookie(cookie, crumbRes);
    const crumb = (await crumbRes.text()).trim();
    if (!crumbRes.ok || !crumb || /too many|unauthorized|error|html/i.test(crumb) || crumb.length > 120) {
      return null;
    }
    yahooSession = { cookie, crumb, expires: now + 30 * 60_000 };
    return yahooSession;
  } catch (err) {
    console.warn("[finance] Yahoo session failed:", err);
    return null;
  }
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function fetchQuoteSnapshotFromStockAnalysis(): Promise<{
  price: number | null;
  change: number | null;
  changePercent: number | null;
  asOf: string;
} | null> {
  const res = await fetch("https://stockanalysis.com/stocks/hca/", {
    headers: { "User-Agent": YAHOO_UA, Accept: "text/html" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Embedded quote blob: quote:{c:6.8,...,p:402.59,...,cp:1.72,...}
  const m = html.match(/quote:\{([^}]{20,400})\}/);
  if (!m) return null;
  const blob = m[1]!;
  const price = numOrNull(Number(blob.match(/\bp:([0-9.]+)/)?.[1]));
  const change = numOrNull(Number(blob.match(/\bc:(-?[0-9.]+)/)?.[1]));
  const changePercent = numOrNull(Number(blob.match(/\bcp:(-?[0-9.]+)/)?.[1]));
  if (price == null) return null;
  return {
    price,
    change,
    changePercent,
    asOf: new Date().toISOString(),
  };
}

export async function fetchHcaChart(rangeKey: ChartRangeKey) {
  const cached = chartCache.get(rangeKey);
  if (cached && cached.expires > Date.now()) return cached.body;

  const { range, interval } = CHART_RANGES[rangeKey];
  const qs =
    `?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false`;
  const hosts = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];

  type YahooChartPayload = {
    chart?: {
      result?: Array<{
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
      error?: { description?: string };
    };
  };
  let raw: YahooChartPayload | null = null;
  let lastStatus = 0;
  for (const host of hosts) {
    try {
      const res = await yahooFetch(`${host}/v8/finance/chart/${SYMBOL}${qs}`);
      lastStatus = res.status;
      if (res.status === 429) {
        await sleep(500);
        continue;
      }
      if (!res.ok) continue;
      raw = (await res.json()) as YahooChartPayload;
      break;
    } catch {
      continue;
    }
  }

  const result = raw?.chart?.result?.[0];
  if (result) {
    const meta = result.meta ?? {};
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const points: { t: number; p: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      const p = closes[i];
      if (typeof t === "number" && typeof p === "number" && Number.isFinite(p)) {
        points.push({ t: t * 1000, p });
      }
    }

    const price = numOrNull(meta.regularMarketPrice);
    const previousClose =
      numOrNull(meta.chartPreviousClose) ??
      numOrNull(meta.previousClose) ??
      (points.length >= 2 ? points[points.length - 2]!.p : null);

    let change: number | null = null;
    let changePercent: number | null = null;
    if (price != null && previousClose != null && previousClose !== 0) {
      change = price - previousClose;
      changePercent = (change / previousClose) * 100;
    }

    const body = {
      symbol: SYMBOL,
      exchange: String(meta.fullExchangeName || meta.exchangeName || "NYSE"),
      name: String(meta.longName || meta.shortName || "HCA Healthcare"),
      currency: String(meta.currency || "USD"),
      price,
      previousClose,
      change,
      changePercent,
      marketState: String(meta.marketState || ""),
      range: rangeKey,
      interval,
      points,
      asOf: new Date().toISOString(),
      source: "Yahoo Finance",
    };

    chartCache.set(rangeKey, { expires: Date.now() + CHART_TTL_MS, body });
    return body;
  }

  // Fallback: price/change only (no history) when Yahoo is rate-limited.
  const snap = await fetchQuoteSnapshotFromStockAnalysis();
  if (!snap) {
    throw new Error(`Yahoo chart HTTP ${lastStatus || "error"}`);
  }
  const body = {
    symbol: SYMBOL,
    exchange: "NYSE",
    name: "HCA Healthcare",
    currency: "USD",
    price: snap.price,
    previousClose: null as number | null,
    change: snap.change,
    changePercent: snap.changePercent,
    marketState: "",
    range: rangeKey,
    interval,
    points: [] as { t: number; p: number }[],
    asOf: snap.asOf,
    source: "Stock Analysis (quote fallback)",
    note: "Historical chart temporarily unavailable from Yahoo Finance",
  };
  chartCache.set(rangeKey, { expires: Date.now() + CHART_TTL_MS, body });
  return body;
}

export interface AnalystRating {
  firm: string;
  analyst: string | null;
  rating: string;
  action: string | null;
  date: string | null;
}

async function fetchAnalystsFromYahoo(): Promise<{
  ratings: AnalystRating[];
  asOf: string;
  source: string;
} | null> {
  const session = await getYahooSession();
  if (!session) return null;

  const modules = "upgradeDowngradeHistory,recommendationTrend";
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${SYMBOL}` +
    `?modules=${encodeURIComponent(modules)}&crumb=${encodeURIComponent(session.crumb)}`;

  const res = await yahooFetch(url, session.cookie);
  if (!res.ok) {
    yahooSession = null;
    return null;
  }
  const data = (await res.json()) as {
    quoteSummary?: {
      result?: Array<{
        upgradeDowngradeHistory?: {
          history?: Array<{
            firm?: string;
            toGrade?: string;
            fromGrade?: string;
            action?: string;
            epochGradeDate?: number;
          }>;
        };
      }>;
      error?: unknown;
    };
  };
  const history = data.quoteSummary?.result?.[0]?.upgradeDowngradeHistory?.history;
  if (!Array.isArray(history) || history.length === 0) return null;

  // Deduplicate by firm, keep most recent
  const seen = new Set<string>();
  const ratings: AnalystRating[] = [];
  for (const row of history) {
    const firm = String(row.firm || "").trim();
    const rating = String(row.toGrade || "").trim();
    if (!firm || !rating) continue;
    const key = firm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ratings.push({
      firm,
      analyst: null,
      rating,
      action: row.action ? String(row.action) : null,
      date: row.epochGradeDate
        ? new Date(row.epochGradeDate * 1000).toISOString().slice(0, 10)
        : null,
    });
    if (ratings.length >= 12) break;
  }
  if (ratings.length === 0) return null;
  return {
    ratings,
    asOf: new Date().toISOString(),
    source: "Yahoo Finance",
  };
}

async function fetchAnalystsFromStockAnalysis(): Promise<{
  ratings: AnalystRating[];
  asOf: string;
  source: string;
  consensus: string | null;
} | null> {
  const res = await fetch("https://stockanalysis.com/stocks/hca/ratings/", {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const ratings: AnalystRating[] = [];
  const re =
    /\{action_rt:"([^"]*)",pt_now:[^,}]*,pt_old:[^,}]*,firm:"([^"]*)",analyst:"([^"]*)",slug:"[^"]*",date:"([^"]*)",rating_new:"([^"]*)"/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const firm = m[2]!.trim();
    const analyst = m[3]!.trim();
    const rating = m[5]!.trim();
    const date = m[4]!.trim();
    const action = m[1]!.trim();
    if (!firm || !rating) continue;
    const key = `${firm.toLowerCase()}|${analyst.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ratings.push({
      firm,
      analyst: analyst || null,
      rating,
      action: action || null,
      date: date || null,
    });
    if (ratings.length >= 12) break;
  }

  if (ratings.length === 0) return null;

  const consensusMatch = html.match(/consensus:"([^"]+)"/);
  const updatedMatch = html.match(/Last updated:<\/span>\s*<span[^>]*>\s*([^<]+)/i);

  return {
    ratings,
    asOf: updatedMatch?.[1]?.trim()
      ? new Date(updatedMatch[1].trim()).toISOString()
      : new Date().toISOString(),
    source: "Stock Analysis (TipRanks)",
    consensus: consensusMatch?.[1] ?? null,
  };
}

export async function fetchHcaAnalysts() {
  if (analystsCache && analystsCache.expires > Date.now()) {
    return analystsCache.body;
  }

  let body: unknown = null;

  // Prefer StockAnalysis: includes firm + analyst name + rating.
  try {
    const sa = await fetchAnalystsFromStockAnalysis();
    if (sa) {
      body = {
        symbol: SYMBOL,
        ratings: sa.ratings,
        consensus: sa.consensus,
        asOf: sa.asOf,
        source: sa.source,
      };
    }
  } catch (err) {
    console.warn("[finance] StockAnalysis analysts failed:", err);
  }

  if (!body) {
    try {
      const yahoo = await fetchAnalystsFromYahoo();
      if (yahoo) {
        body = {
          symbol: SYMBOL,
          ratings: yahoo.ratings,
          consensus: null as string | null,
          asOf: yahoo.asOf,
          source: yahoo.source,
        };
      }
    } catch (err) {
      console.warn("[finance] Yahoo analysts failed:", err);
    }
  }

  if (!body) {
    body = {
      symbol: SYMBOL,
      ratings: [] as AnalystRating[],
      consensus: null,
      asOf: new Date().toISOString(),
      source: null,
      error: "Analyst ratings temporarily unavailable",
    };
  }

  analystsCache = { expires: Date.now() + ANALYSTS_TTL_MS, body };
  return body;
}
