/**
 * Server-side finance helpers for the HCA Watchdog page.
 * Quote/chart: Yahoo Finance v8 first; Nasdaq.com JSON fallback (no API key).
 * Analysts: merge Stock Analysis (TipRanks), MarketBeat, Yahoo upgrade history.
 * TipRanks via Stock Analysis free page typically exposes ~8 named recent ratings;
 * MarketBeat “most recent per brokerage” adds further distinct firms. Display
 * capped at ANALYST_DISPLAY_LIMIT. Nasdaq /api/analyst/.../ratings lists broker
 * names but not per-firm grades (upgradesDowngrades empty) — not used for rows.
 * Insiders: Yahoo quoteSummary (crumb) + OpenInsider Form 4 + Nasdaq; merge/dedupe;
 * display capped at INSIDER_DISPLAY_LIMIT within ~INSIDER_LOOKBACK_DAYS.
 */

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SYMBOL = "HCA";
export const YAHOO_QUOTE_URL = "https://finance.yahoo.com/quote/HCA/";

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
let statsCache: { expires: number; body: HcaKeyStats } | null = null;
let insidersCache: { expires: number; body: unknown } | null = null;

const CHART_TTL_MS = 60_000;
const ANALYSTS_TTL_MS = 15 * 60_000;
const STATS_TTL_MS = 15 * 60_000;
const INSIDERS_TTL_MS = 15 * 60_000;
/** Recent Form 4 window shown on the HCA dashboard. */
const INSIDER_LOOKBACK_DAYS = 180;
const INSIDER_DISPLAY_LIMIT = 25;
const INSIDER_FETCH_LIMIT = 80;

export interface HcaKeyStats {
  week52Low: number | null;
  week52High: number | null;
  eps: number | null;
  marketCap: number | null;
  earningsDate: string | null;
  earningsDateLabel: string;
  source: string | null;
}

export interface InsiderTransaction {
  filer: string;
  role: string | null;
  type: string;
  shares: number | null;
  price: number | null;
  value: number | null;
  date: string | null;
  ownership: string | null;
}

type YahooSession = { cookie: string; crumb: string; expires: number };
let yahooSession: YahooSession | null = null;

type ChartPoint = { t: number; p: number };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function yahooFetch(url: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": YAHOO_UA,
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://finance.yahoo.com/",
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

function parseMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/[$,%\s,+]/g, "").replace(/^\((.+)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeStartDate(rangeKey: ChartRangeKey, end: Date): Date {
  const start = new Date(end);
  switch (rangeKey) {
    case "1d":
      start.setUTCDate(start.getUTCDate() - 1);
      break;
    case "5d":
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case "1mo":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "3mo":
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case "6mo":
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case "1y":
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
    case "5y":
      start.setUTCFullYear(start.getUTCFullYear() - 5);
      break;
  }
  return start;
}

/** Keep weekly samples for 5Y so Chart.js stays light. */
function downsampleWeekly(points: ChartPoint[]): ChartPoint[] {
  if (points.length <= 320) return points;
  const byWeek = new Map<string, ChartPoint>();
  for (const p of points) {
    const d = new Date(p.t);
    const key = `${d.getUTCFullYear()}-W${Math.floor(d.getUTCDate() / 7)}-${d.getUTCMonth()}`;
    byWeek.set(key, p);
  }
  return [...byWeek.values()].sort((a, b) => a.t - b.t);
}

async function nasdaqFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "application/json,text/plain,*/*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/market-activity/stocks/hca",
    },
  });
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

async function fetchChartFromYahoo(rangeKey: ChartRangeKey): Promise<{
  points: ChartPoint[];
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  exchange: string;
  name: string;
  currency: string;
  marketState: string;
  interval: string;
} | null> {
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

  async function tryHosts(
    cookie?: string,
    crumb?: string,
  ): Promise<YahooChartPayload | null> {
    for (const host of hosts) {
      try {
        const crumbQs = crumb
          ? `${qs}&crumb=${encodeURIComponent(crumb)}`
          : qs;
        const res = await yahooFetch(
          `${host}/v8/finance/chart/${SYMBOL}${crumbQs}`,
          cookie,
        );
        if (res.status === 429) {
          await sleep(400);
          continue;
        }
        if (!res.ok) continue;
        const payload = (await res.json()) as YahooChartPayload;
        if (payload?.chart?.result?.[0]) return payload;
      } catch {
        continue;
      }
    }
    return null;
  }

  // Bare call only — crumb/session rarely helps when cloud IPs get 429,
  // and slows the Nasdaq fallback that restores the in-page chart.
  const raw = await tryHosts();

  const result = raw?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta ?? {};
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: ChartPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const p = closes[i];
    if (typeof t === "number" && typeof p === "number" && Number.isFinite(p)) {
      points.push({ t: t * 1000, p });
    }
  }
  if (!points.length) return null;

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

  return {
    points,
    price,
    previousClose,
    change,
    changePercent,
    exchange: String(meta.fullExchangeName || meta.exchangeName || "NYSE"),
    name: String(meta.longName || meta.shortName || "HCA Healthcare"),
    currency: String(meta.currency || "USD"),
    marketState: String(meta.marketState || ""),
    interval,
  };
}

async function fetchIntradayFromNasdaq(): Promise<{
  points: ChartPoint[];
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  exchange: string;
  name: string;
} | null> {
  const res = await nasdaqFetch(
    `https://api.nasdaq.com/api/quote/${SYMBOL}/chart?assetclass=stocks`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: {
      chart?: Array<{ x?: number; y?: number }>;
      lastSalePrice?: string;
      previousClose?: string;
      netChange?: string;
      percentageChange?: string;
      exchange?: string;
      company?: string;
    };
  };
  const rows = data.data?.chart ?? [];
  const points: ChartPoint[] = [];
  for (const row of rows) {
    const t = numOrNull(row.x);
    const p = numOrNull(row.y);
    if (t != null && p != null) points.push({ t, p });
  }
  if (!points.length) return null;
  return {
    points,
    price: parseMoney(data.data?.lastSalePrice) ?? points[points.length - 1]!.p,
    previousClose: parseMoney(data.data?.previousClose),
    change: parseMoney(data.data?.netChange),
    changePercent: parseMoney(data.data?.percentageChange),
    exchange: String(data.data?.exchange || "NYSE"),
    name: String(data.data?.company || "HCA Healthcare"),
  };
}

async function fetchDailyFromNasdaq(rangeKey: ChartRangeKey): Promise<{
  points: ChartPoint[];
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  exchange: string;
  name: string;
} | null> {
  const end = new Date();
  const start = rangeStartDate(rangeKey, end);
  const url =
    `https://api.nasdaq.com/api/quote/${SYMBOL}/historical` +
    `?assetclass=stocks&fromdate=${isoDateUTC(start)}&todate=${isoDateUTC(end)}&limit=9999`;
  const res = await nasdaqFetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: {
      tradesTable?: {
        rows?: Array<{ date?: string; close?: string }>;
      };
      symbol?: string;
    };
  };
  const rows = data.data?.tradesTable?.rows ?? [];
  const points: ChartPoint[] = [];
  for (const row of rows) {
    const close = parseMoney(row.close);
    if (close == null || !row.date) continue;
    const t = Date.parse(row.date);
    if (!Number.isFinite(t)) continue;
    points.push({ t, p: close });
  }
  // Nasdaq returns newest-first.
  points.sort((a, b) => a.t - b.t);
  const series = rangeKey === "5y" ? downsampleWeekly(points) : points;
  if (!series.length) return null;

  // Prefer live quote fields when available.
  let price = series[series.length - 1]!.p;
  let previousClose: number | null =
    series.length >= 2 ? series[series.length - 2]!.p : null;
  let change: number | null = null;
  let changePercent: number | null = null;
  let exchange = "NYSE";
  let name = "HCA Healthcare";
  try {
    const infoRes = await nasdaqFetch(
      `https://api.nasdaq.com/api/quote/${SYMBOL}/info?assetclass=stocks`,
    );
    if (infoRes.ok) {
      const info = (await infoRes.json()) as {
        data?: {
          companyName?: string;
          exchange?: string;
          primaryData?: {
            lastSalePrice?: string;
            netChange?: string;
            percentageChange?: string;
          };
        };
      };
      price = parseMoney(info.data?.primaryData?.lastSalePrice) ?? price;
      change = parseMoney(info.data?.primaryData?.netChange);
      changePercent = parseMoney(info.data?.primaryData?.percentageChange);
      exchange = String(info.data?.exchange || exchange);
      name = String(info.data?.companyName || name);
      if (change != null && price != null) previousClose = price - change;
    }
  } catch {
    // ignore info errors; series alone is enough
  }
  if (change == null && price != null && previousClose != null) {
    change = price - previousClose;
    changePercent = previousClose !== 0 ? (change / previousClose) * 100 : null;
  }

  return { points: series, price, previousClose, change, changePercent, exchange, name };
}

async function fetchChartFromNasdaq(rangeKey: ChartRangeKey) {
  if (rangeKey === "1d") {
    return fetchIntradayFromNasdaq();
  }
  // 5d: daily bars (Nasdaq chart endpoint is intraday-only ~1 session).
  return fetchDailyFromNasdaq(rangeKey);
}

function emptyKeyStats(): HcaKeyStats {
  return {
    week52Low: null,
    week52High: null,
    eps: null,
    marketCap: null,
    earningsDate: null,
    earningsDateLabel: "Earnings",
    source: null,
  };
}

function earningsLabelForDate(isoOrText: string | null): string {
  if (!isoOrText) return "Earnings";
  const t = Date.parse(isoOrText);
  if (!Number.isFinite(t)) return "Earnings";
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return t >= day.getTime() ? "Next earnings" : "Most recent earnings";
}

function parseFiftyTwoWeek(raw: string | null | undefined): {
  low: number | null;
  high: number | null;
} {
  if (!raw || /n\/?a/i.test(raw)) return { low: null, high: null };
  // "556.52/353.13" (high/low) or "353.13 - 556.52" (low - high)
  const slash = raw.match(/\$?([\d,.]+)\s*\/\s*\$?([\d,.]+)/);
  if (slash) {
    const a = parseMoney(slash[1]);
    const b = parseMoney(slash[2]);
    if (a == null || b == null) return { low: null, high: null };
    return { low: Math.min(a, b), high: Math.max(a, b) };
  }
  const dash = raw.match(/\$?([\d,.]+)\s*[-–]\s*\$?([\d,.]+)/);
  if (dash) {
    const a = parseMoney(dash[1]);
    const b = parseMoney(dash[2]);
    if (a == null || b == null) return { low: null, high: null };
    return { low: Math.min(a, b), high: Math.max(a, b) };
  }
  return { low: null, high: null };
}

function parseMarketCapLoose(raw: string | null | undefined): number | null {
  if (!raw || /n\/?a/i.test(raw)) return null;
  const m = raw.trim().match(/^\$?([\d,.]+)\s*([KMBTkmbt])?$/);
  if (!m) return parseMoney(raw);
  const base = parseMoney(m[1]);
  if (base == null) return null;
  const mult =
    { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || "").toLowerCase()] ?? 1;
  return base * mult;
}

async function fetchKeyStatsFromYahoo(): Promise<HcaKeyStats | null> {
  const session = await getYahooSession();
  if (!session) return null;
  const modules =
    "defaultKeyStatistics,summaryDetail,calendarEvents,price";
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
        summaryDetail?: Record<string, { raw?: number } | undefined>;
        defaultKeyStatistics?: Record<string, { raw?: number } | undefined>;
        calendarEvents?: {
          earnings?: { earningsDate?: Array<{ raw?: number; fmt?: string }> };
        };
        price?: { marketCap?: { raw?: number } };
      }>;
    };
  };
  const row = data.quoteSummary?.result?.[0];
  if (!row) return null;
  const sd = row.summaryDetail ?? {};
  const ks = row.defaultKeyStatistics ?? {};
  const earnDates = row.calendarEvents?.earnings?.earningsDate ?? [];
  const earnRaw = earnDates[0]?.raw;
  const earningsDate =
    typeof earnRaw === "number"
      ? new Date(earnRaw * 1000).toISOString().slice(0, 10)
      : earnDates[0]?.fmt
        ? String(earnDates[0].fmt)
        : null;
  const week52Low = numOrNull(sd.fiftyTwoWeekLow?.raw);
  const week52High = numOrNull(sd.fiftyTwoWeekHigh?.raw);
  const eps = numOrNull(ks.trailingEps?.raw);
  const marketCap =
    numOrNull(sd.marketCap?.raw) ?? numOrNull(row.price?.marketCap?.raw);
  if (week52Low == null && week52High == null && eps == null && marketCap == null) {
    return null;
  }
  return {
    week52Low,
    week52High,
    eps,
    marketCap,
    earningsDate,
    earningsDateLabel: earningsLabelForDate(earningsDate),
    source: "Yahoo Finance",
  };
}

async function fetchKeyStatsFromNasdaq(): Promise<Partial<HcaKeyStats> | null> {
  const res = await nasdaqFetch(
    `https://api.nasdaq.com/api/quote/${SYMBOL}/summary?assetclass=stocks`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: {
      summaryData?: Record<string, { value?: string } | undefined>;
    };
  };
  const sd = data.data?.summaryData ?? {};
  const range = parseFiftyTwoWeek(sd.FiftTwoWeekHighLow?.value);
  const marketCap = parseMarketCapLoose(sd.MarketCap?.value);
  if (range.low == null && range.high == null && marketCap == null) return null;
  return {
    week52Low: range.low,
    week52High: range.high,
    marketCap,
    source: "Nasdaq.com",
  };
}

async function fetchKeyStatsFromStockAnalysis(): Promise<Partial<HcaKeyStats> | null> {
  const res = await fetch("https://stockanalysis.com/stocks/hca/", {
    headers: { "User-Agent": YAHOO_UA, Accept: "text/html" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const pick = (label: string): string | null => {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Label cell may wrap an <a>; value is the next <td>/<th> text.
    const re = new RegExp(
      esc + "[\\s\\S]{0,180}?</t[dh]>\\s*<t[dh][^>]*>\\s*([^<]+)",
      "i",
    );
    const m = html.match(re);
    return m?.[1]?.trim() || null;
  };
  const week = parseFiftyTwoWeek(pick("52-Week Range"));
  const eps = parseMoney(pick("EPS"));
  const marketCap = parseMarketCapLoose(pick("Market Cap"));
  const earningsRaw = pick("Earnings Date");
  let earningsDate: string | null = null;
  if (earningsRaw && !/n\/?a/i.test(earningsRaw)) {
    const t = Date.parse(earningsRaw);
    earningsDate = Number.isFinite(t)
      ? new Date(t).toISOString().slice(0, 10)
      : earningsRaw;
  }
  if (
    week.low == null &&
    week.high == null &&
    eps == null &&
    marketCap == null &&
    !earningsDate
  ) {
    return null;
  }
  return {
    week52Low: week.low,
    week52High: week.high,
    eps,
    marketCap,
    earningsDate,
    earningsDateLabel: earningsLabelForDate(earningsDate),
    source: "Stock Analysis",
  };
}

export async function fetchHcaKeyStats(): Promise<HcaKeyStats> {
  if (statsCache && statsCache.expires > Date.now()) return statsCache.body;

  const merged = emptyKeyStats();
  const sources: string[] = [];

  try {
    const yahoo = await fetchKeyStatsFromYahoo();
    if (yahoo) {
      Object.assign(merged, yahoo);
      if (yahoo.source) sources.push(yahoo.source);
    }
  } catch (err) {
    console.warn("[finance] Yahoo key stats failed:", err);
  }

  const needMore =
    merged.week52Low == null ||
    merged.week52High == null ||
    merged.eps == null ||
    merged.marketCap == null ||
    !merged.earningsDate;

  if (needMore) {
    try {
      const nq = await fetchKeyStatsFromNasdaq();
      if (nq) {
        if (merged.week52Low == null) merged.week52Low = nq.week52Low ?? null;
        if (merged.week52High == null) merged.week52High = nq.week52High ?? null;
        if (merged.marketCap == null) merged.marketCap = nq.marketCap ?? null;
        if (nq.source) sources.push(nq.source);
      }
    } catch (err) {
      console.warn("[finance] Nasdaq key stats failed:", err);
    }
  }

  const stillNeed =
    merged.eps == null || !merged.earningsDate || merged.marketCap == null ||
    merged.week52Low == null || merged.week52High == null;
  if (stillNeed) {
    try {
      const sa = await fetchKeyStatsFromStockAnalysis();
      if (sa) {
        if (merged.week52Low == null) merged.week52Low = sa.week52Low ?? null;
        if (merged.week52High == null) merged.week52High = sa.week52High ?? null;
        if (merged.eps == null) merged.eps = sa.eps ?? null;
        if (merged.marketCap == null) merged.marketCap = sa.marketCap ?? null;
        if (!merged.earningsDate && sa.earningsDate) {
          merged.earningsDate = sa.earningsDate;
          merged.earningsDateLabel = sa.earningsDateLabel ||
            earningsLabelForDate(sa.earningsDate);
        }
        if (sa.source) sources.push(sa.source);
      }
    } catch (err) {
      console.warn("[finance] StockAnalysis key stats failed:", err);
    }
  }

  merged.earningsDateLabel = earningsLabelForDate(merged.earningsDate);
  merged.source = sources.length ? [...new Set(sources)].join(" + ") : null;
  statsCache = { expires: Date.now() + STATS_TTL_MS, body: merged };
  return merged;
}

function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseInsiderDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  // OpenInsider / ISO already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s || null;
  return new Date(t).toISOString().slice(0, 10);
}

/** Normalize Form 4 / vendor labels to short UI types (Sale/Award/Gift/…). */
function normalizeInsiderType(
  raw: string,
  opts?: { price?: number | null },
): string {
  const t = raw.trim();
  if (!t) return "Other";
  const lower = t.toLowerCase();

  // OpenInsider codes: "G - Gift", "A - Grant", "S - Sale", "F - Tax", "M - OptEx"
  const oi = lower.match(/^([a-z]{1,3})\s*-\s*(.+)$/);
  if (oi) {
    const code = oi[1]!;
    if (code === "g") return "Gift";
    if (code === "a") return "Award";
    if (code === "s") return "Sale";
    if (code === "f") return "Tax";
    if (code === "m" || code === "x") return "Option Exercise";
    if (code === "p") return "Purchase";
    if (code === "d") return "Sale";
    if (code === "c") return "Conversion";
  }

  if (/\bgift\b/.test(lower)) return "Gift";
  if (/\b(grant|award|stock award)\b/.test(lower)) return "Award";
  if (/\b(sale|sell)\b/.test(lower)) return "Sale";
  if (/\b(buy|purchase)\b/.test(lower)) return "Purchase";
  if (/\b(tax|withhold)/.test(lower)) return "Tax";
  if (/\b(option\s*exec|optex|exercise)\b/.test(lower)) return "Option Exercise";

  // Nasdaq opaque non-open-market codes — infer from price when possible.
  if (/disposition\s*\(non open market\)/.test(lower)) {
    return opts?.price != null && opts.price > 0 ? "Tax" : "Gift";
  }
  if (/acquisition\s*\(non open market\)/.test(lower)) {
    return opts?.price != null && opts.price > 0 ? "Acquisition" : "Award";
  }
  if (/option execute/.test(lower)) return "Option Exercise";

  // Yahoo often: "Sale at price 505.00 per share."
  if (/^sale\b/.test(lower)) return "Sale";
  if (/^purchase\b/.test(lower)) return "Purchase";

  return t.length > 28 ? `${t.slice(0, 25)}…` : t;
}

function insiderTypeRank(type: string): number {
  // Higher = prefer when deduping (cleaner Form 4 labels beat Nasdaq jargon).
  switch (type) {
    case "Gift":
    case "Award":
    case "Sale":
    case "Purchase":
    case "Tax":
    case "Option Exercise":
    case "Conversion":
      return 3;
    case "Acquisition":
      return 2;
    default:
      return 1;
  }
}

function insiderDedupeKey(tx: InsiderTransaction): string {
  const name = (tx.filer || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const shares =
    tx.shares != null && Number.isFinite(tx.shares)
      ? String(Math.round(Math.abs(tx.shares)))
      : "";
  // Collapse Sale/Tax/Gift families loosely so Nasdaq Disposition≈Gift/Tax merge.
  const family = (() => {
    const t = tx.type;
    if (t === "Sale" || t === "Purchase") return t;
    if (t === "Gift" || t === "Tax") return t;
    if (t === "Award" || t === "Acquisition") return "Award";
    if (t === "Option Exercise") return "Option Exercise";
    return t.toLowerCase();
  })();
  return `${tx.date || ""}|${name}|${shares}|${family}`;
}

function withinInsiderLookback(date: string | null, cutoffMs: number): boolean {
  if (!date) return true; // keep undated rather than inventing a drop
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return true;
  return t >= cutoffMs;
}

function compareInsiderDateDesc(a: InsiderTransaction, b: InsiderTransaction): number {
  const da = a.date || "";
  const db = b.date || "";
  if (da !== db) return db.localeCompare(da);
  return (a.filer || "").localeCompare(b.filer || "");
}

/** Prefer Sale/Gift/Award over Tax/OptEx so open-market activity isn't crowded out. */
function insiderSignalRank(type: string): number {
  switch (type) {
    case "Sale":
    case "Purchase":
    case "Gift":
      return 0;
    case "Award":
    case "Acquisition":
      return 1;
    case "Option Exercise":
    case "Conversion":
      return 2;
    case "Tax":
      return 3;
    default:
      return 2;
  }
}

function selectInsiderDisplay(rows: InsiderTransaction[]): InsiderTransaction[] {
  if (rows.length <= INSIDER_DISPLAY_LIMIT) {
    return [...rows].sort(compareInsiderDateDesc);
  }
  const sorted = [...rows].sort(compareInsiderDateDesc);
  const high = sorted.filter((t) => insiderSignalRank(t.type) <= 1);
  const low = sorted.filter((t) => insiderSignalRank(t.type) > 1);
  const picked: InsiderTransaction[] = [];
  for (const t of high) {
    if (picked.length >= INSIDER_DISPLAY_LIMIT) break;
    picked.push(t);
  }
  for (const t of low) {
    if (picked.length >= INSIDER_DISPLAY_LIMIT) break;
    picked.push(t);
  }
  return picked.sort(compareInsiderDateDesc);
}

function mergeInsiderTransactions(
  batches: Array<{ source: string; rows: InsiderTransaction[] }>,
): { transactions: InsiderTransaction[]; sources: string[] } {
  const cutoff = Date.now() - INSIDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const best = new Map<
    string,
    { tx: InsiderTransaction; rank: number; source: string }
  >();
  const usedSources = new Set<string>();

  for (const batch of batches) {
    for (const row of batch.rows) {
      if (!withinInsiderLookback(row.date, cutoff)) continue;
      if (!row.filer || !row.type) continue;
      const key = insiderDedupeKey(row);
      const rank = insiderTypeRank(row.type);
      const prev = best.get(key);
      if (!prev || rank > prev.rank) {
        // Prefer richer role/value from the winning row; fill gaps from prev.
        const merged: InsiderTransaction = prev
          ? {
              ...row,
              role: row.role || prev.tx.role,
              ownership: row.ownership || prev.tx.ownership,
              value: row.value ?? prev.tx.value,
              price: row.price ?? prev.tx.price,
              shares: row.shares ?? prev.tx.shares,
            }
          : row;
        best.set(key, { tx: merged, rank, source: batch.source });
        usedSources.add(batch.source);
      } else if (prev) {
        if (!prev.tx.role && row.role) prev.tx.role = row.role;
        if (!prev.tx.ownership && row.ownership) prev.tx.ownership = row.ownership;
        if (prev.tx.value == null && row.value != null) prev.tx.value = row.value;
        if (prev.tx.price == null && row.price != null) prev.tx.price = row.price;
        usedSources.add(batch.source);
      }
    }
  }

  const transactions = selectInsiderDisplay([...best.values()].map((v) => v.tx));

  return { transactions, sources: [...usedSources] };
}

async function fetchInsidersFromNasdaq(): Promise<InsiderTransaction[]> {
  const res = await nasdaqFetch(
    `https://api.nasdaq.com/api/company/${SYMBOL}/insider-trades?limit=${INSIDER_FETCH_LIMIT}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    data?: {
      transactionTable?: {
        table?: {
          rows?: Array<{
            insider?: string;
            relation?: string;
            lastDate?: string;
            transactionType?: string;
            ownType?: string;
            sharesTraded?: string;
            lastPrice?: string;
          }>;
        };
      };
    };
  };
  const rows = data.data?.transactionTable?.table?.rows ?? [];
  const transactions: InsiderTransaction[] = [];
  for (const row of rows) {
    const filer = titleCaseName(String(row.insider || "").trim());
    const rawType = String(row.transactionType || "").trim();
    if (!filer || !rawType) continue;
    const shares = parseMoney(row.sharesTraded);
    const price = parseMoney(row.lastPrice);
    const type = normalizeInsiderType(rawType, { price });
    const value =
      shares != null && price != null && price > 0 ? shares * price : null;
    transactions.push({
      filer,
      role: row.relation ? String(row.relation).trim() : null,
      type,
      shares: shares != null ? Math.abs(shares) : null,
      price: price != null && price > 0 ? price : null,
      value,
      date: parseInsiderDate(row.lastDate),
      ownership: row.ownType ? String(row.ownType).trim() : null,
    });
  }
  return transactions;
}

async function fetchInsidersFromYahoo(): Promise<InsiderTransaction[]> {
  const session = await getYahooSession();
  if (!session) return [];
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${SYMBOL}` +
    `?modules=insiderTransactions&crumb=${encodeURIComponent(session.crumb)}`;
  const res = await yahooFetch(url, session.cookie);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    quoteSummary?: {
      result?: Array<{
        insiderTransactions?: {
          transactions?: Array<{
            filerName?: string;
            filerRelation?: string;
            transactionText?: string;
            shares?: { raw?: number };
            value?: { raw?: number };
            startDate?: { raw?: number; fmt?: string };
            ownership?: string;
          }>;
        };
      }>;
    };
  };
  const rows =
    data.quoteSummary?.result?.[0]?.insiderTransactions?.transactions ?? [];
  const transactions: InsiderTransaction[] = [];
  for (const row of rows) {
    const filer = String(row.filerName || "").trim();
    const rawType = String(row.transactionText || "").trim();
    if (!filer || !rawType) continue;
    const sharesRaw = numOrNull(row.shares?.raw);
    const valueRaw = numOrNull(row.value?.raw);
    const shares = sharesRaw != null ? Math.abs(sharesRaw) : null;
    const value =
      valueRaw != null && Math.abs(valueRaw) > 0 ? Math.abs(valueRaw) : null;
    const price =
      shares != null && value != null && shares !== 0 ? value / shares : null;
    transactions.push({
      filer,
      role: row.filerRelation ? String(row.filerRelation).trim() : null,
      type: normalizeInsiderType(rawType, { price }),
      shares,
      price,
      value,
      date:
        typeof row.startDate?.raw === "number"
          ? new Date(row.startDate.raw * 1000).toISOString().slice(0, 10)
          : row.startDate?.fmt
            ? parseInsiderDate(String(row.startDate.fmt))
            : null,
      ownership: row.ownership ? String(row.ownership).trim() : null,
    });
  }
  return transactions;
}

/** OpenInsider Form 4 screener — codes match Yahoo (Gift/Grant/Sale/Tax). */
async function fetchInsidersFromOpenInsider(): Promise<InsiderTransaction[]> {
  const url =
    `http://openinsider.com/screener?s=${encodeURIComponent(SYMBOL)}` +
    `&fd=${INSIDER_LOOKBACK_DAYS}&td=0` +
    `&xp=1&xs=1&xa=1&xd=1&xg=1&xf=1&xm=1&xx=1&xc=1&xw=1` +
    `&sortcol=0&cnt=${INSIDER_FETCH_LIMIT}&page=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const tableMatch = html.match(
    /<table[^>]*class="[^"]*tinytable[^"]*"[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!tableMatch) return [];
  const rowHtmls = tableMatch[1]!.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const transactions: InsiderTransaction[] = [];

  for (const rowHtml of rowHtmls) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) => m[1] ?? "",
    );
    if (cells.length < 9) continue;
    const cellText = (i: number) =>
      cells[i]!
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();

    const tradeDate = cellText(2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) continue; // skip header
    const filer = cellText(4);
    const role = cellText(5) || null;
    const rawType = cellText(6);
    if (!filer || !rawType) continue;
    // Ticker cell can include Tip() junk; require HCA somewhere in row.
    if (!/HCA/i.test(cellText(3)) && !/HCA/i.test(rowHtml)) continue;

    const price = parseMoney(cellText(7));
    const sharesSigned = parseMoney(cellText(8));
    const valueSigned = parseMoney(cellText(11));
    const shares =
      sharesSigned != null ? Math.abs(sharesSigned) : null;
    const value =
      valueSigned != null && Math.abs(valueSigned) > 0
        ? Math.abs(valueSigned)
        : null;

    transactions.push({
      filer,
      role,
      type: normalizeInsiderType(rawType, { price }),
      shares,
      price: price != null && price > 0 ? price : null,
      value,
      date: tradeDate,
      ownership: null,
    });
  }
  return transactions;
}

export async function fetchHcaInsiders() {
  if (insidersCache && insidersCache.expires > Date.now()) {
    return insidersCache.body;
  }

  const coded: Array<{ source: string; rows: InsiderTransaction[] }> = [];
  const fallback: Array<{ source: string; rows: InsiderTransaction[] }> = [];

  // Yahoo + OpenInsider carry Gift/Award/Sale codes (Yahoo-like). Nasdaq is jargon-heavy.
  try {
    const rows = await fetchInsidersFromYahoo();
    if (rows.length) coded.push({ source: "Yahoo Finance", rows });
  } catch (err) {
    console.warn("[finance] Yahoo insiders failed:", err);
  }

  try {
    const rows = await fetchInsidersFromOpenInsider();
    if (rows.length) coded.push({ source: "OpenInsider", rows });
  } catch (err) {
    console.warn("[finance] OpenInsider insiders failed:", err);
  }

  try {
    const rows = await fetchInsidersFromNasdaq();
    if (rows.length) fallback.push({ source: "Nasdaq.com", rows });
  } catch (err) {
    console.warn("[finance] Nasdaq insiders failed:", err);
  }

  const codedCount = coded.reduce((n, b) => n + b.rows.length, 0);
  // Avoid double-counting Nasdaq legs (e.g. Marks 3,336×2) when Form 4 codes exist.
  const batches = codedCount >= 10 ? coded : [...coded, ...fallback];
  const { transactions, sources } = mergeInsiderTransactions(
    batches.length ? batches : fallback,
  );

  if (transactions.length) {
    const body = {
      symbol: SYMBOL,
      transactions,
      asOf: new Date().toISOString(),
      source: sources.join(" + "),
      lookbackDays: INSIDER_LOOKBACK_DAYS,
      limit: INSIDER_DISPLAY_LIMIT,
    };
    insidersCache = { expires: Date.now() + INSIDERS_TTL_MS, body };
    return body;
  }

  const body = {
    symbol: SYMBOL,
    transactions: [] as InsiderTransaction[],
    asOf: new Date().toISOString(),
    source: null,
    error: "Insider transactions temporarily unavailable",
  };
  insidersCache = { expires: Date.now() + Math.min(INSIDERS_TTL_MS, 60_000), body };
  return body;
}

export async function fetchHcaChart(rangeKey: ChartRangeKey) {
  const cached = chartCache.get(rangeKey);
  if (cached && cached.expires > Date.now()) return cached.body;

  const { interval } = CHART_RANGES[rangeKey];
  const statsPromise = fetchHcaKeyStats().catch((err) => {
    console.warn("[finance] key stats failed:", err);
    return emptyKeyStats();
  });

  let body: Record<string, unknown> | null = null;

  try {
    const yahoo = await fetchChartFromYahoo(rangeKey);
    if (yahoo) {
      body = {
        symbol: SYMBOL,
        exchange: yahoo.exchange,
        name: yahoo.name,
        currency: yahoo.currency,
        price: yahoo.price,
        previousClose: yahoo.previousClose,
        change: yahoo.change,
        changePercent: yahoo.changePercent,
        marketState: yahoo.marketState,
        range: rangeKey,
        interval: yahoo.interval,
        points: yahoo.points,
        asOf: new Date().toISOString(),
        source: "Yahoo Finance",
        yahooUrl: YAHOO_QUOTE_URL,
      };
    }
  } catch (err) {
    console.warn("[finance] Yahoo chart failed:", err);
  }

  if (!body) {
    try {
      const nasdaq = await fetchChartFromNasdaq(rangeKey);
      if (nasdaq) {
        body = {
          symbol: SYMBOL,
          exchange: nasdaq.exchange,
          name: nasdaq.name,
          currency: "USD",
          price: nasdaq.price,
          previousClose: nasdaq.previousClose,
          change: nasdaq.change,
          changePercent: nasdaq.changePercent,
          marketState: "",
          range: rangeKey,
          interval: rangeKey === "1d" ? "intraday" : rangeKey === "5y" ? "1wk" : "1d",
          points: nasdaq.points,
          asOf: new Date().toISOString(),
          source: "Nasdaq.com",
          yahooUrl: YAHOO_QUOTE_URL,
        };
      }
    } catch (err) {
      console.warn("[finance] Nasdaq chart failed:", err);
    }
  }

  if (!body) {
    // Last resort: price/change only (no history).
    const snap = await fetchQuoteSnapshotFromStockAnalysis();
    if (!snap) {
      throw new Error("All HCA chart sources failed (Yahoo + Nasdaq + StockAnalysis)");
    }
    body = {
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
      points: [] as ChartPoint[],
      asOf: snap.asOf,
      source: "Stock Analysis (quote fallback)",
      yahooUrl: YAHOO_QUOTE_URL,
    };
  }

  body.stats = await statsPromise;
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

/** Max distinct-firm rows returned to the HCA dashboard. */
const ANALYST_DISPLAY_LIMIT = 6;

type AnalystSourceResult = {
  ratings: AnalystRating[];
  asOf: string;
  source: string;
  consensus: string | null;
};

function cleanRatingLabel(raw: string): string | null {
  let rating = raw.replace(/&(?:rarr|arr);/gi, "→").replace(/\s+/g, " ").trim();
  if (!rating || /^n\/?a$/i.test(rating)) return null;
  // Take the newest grade from "Overweight → Equal Weight"
  if (rating.includes("→")) {
    const parts = rating.split("→").map((p) => p.trim()).filter(Boolean);
    rating = parts[parts.length - 1] || rating;
  }
  // Strip letter-grade suffixes like "Hold (C+)"
  rating = rating.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!rating || /^n\/?a$/i.test(rating) || /^\d+(\.\d+)?$/.test(rating)) {
    return null;
  }
  return rating;
}

function isRecognizedRating(rating: string): boolean {
  const k = rating.toLowerCase().replace(/[^a-z]/g, "");
  return /strongbuy|buy|outperform|overweight|accumulate|hold|neutral|equalweight|marketperform|mktperform|peerperform|inline|sell|strongsell|underperform|underweight|reduce/.test(
    k,
  );
}

/** Canonical firm key for dedupe across sources (aliases + suffix stripping). */
function normalizeFirmKey(firm: string): string {
  const raw = firm.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/goldman/, "goldman"],
    [/bernstein/, "bernstein"],
    [/mizuho/, "mizuho"],
    [/deutsche/, "deutsche"],
    [/\bubs\b/, "ubs"],
    [/truist|bb[& ]?t/, "truist"],
    [/royal bank of canada|\brbc\b/, "rbc"],
    [/jp\s*morgan|jpmorgan/, "jpmorgan"],
    [/bank of america|bofa|b of a/, "bofa"],
    [/barclays/, "barclays"],
    [/wells fargo/, "wellsfargo"],
    [/raymond james/, "raymondjames"],
    [/oppenheimer/, "oppenheimer"],
    [/cantor/, "cantor"],
    [/td cowen|\bcowen\b/, "tdcowen"],
    [/stephens/, "stephens"],
    [/leerink/, "leerink"],
    [/argus/, "argus"],
    [/key\s*(corp|banc)|keybanc/, "keybanc"],
    [/\bbaird\b/, "baird"],
    [/wolfe/, "wolfe"],
    [/jefferies/, "jefferies"],
    [/morgan stanley/, "morganstanley"],
    [/citigroup|\bciti\b/, "citi"],
    [/loop capital/, "loop"],
    [/zacks/, "zacks"],
    [/weiss/, "weiss"],
    [/guggenheim/, "guggenheim"],
    [/piper/, "piper"],
    [/evercore/, "evercore"],
    [/loop/, "loop"],
  ];
  for (const [re, key] of rules) {
    if (re.test(raw)) return key;
  }
  return raw.replace(/[^a-z0-9]/g, "");
}

function ratingDateMs(date: string | null): number {
  if (!date) return 0;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : 0;
}

function preferAnalystRow(a: AnalystRating, b: AnalystRating): AnalystRating {
  const da = ratingDateMs(a.date);
  const db = ratingDateMs(b.date);
  if (da !== db) return da > db ? a : b;
  // Prefer rows that include an analyst name when dates tie.
  if (a.analyst && !b.analyst) return a;
  if (b.analyst && !a.analyst) return b;
  return a;
}

function mergeAnalystRatings(
  batches: Array<{ ratings: AnalystRating[]; source: string; priority: number }>,
): { ratings: AnalystRating[]; sources: string[] } {
  // Lower priority number wins when dates are equal and both have/lack names.
  type Entry = { row: AnalystRating; priority: number; source: string };
  const byFirm = new Map<string, Entry>();
  const usedSources = new Set<string>();

  const sorted = [...batches].sort((x, y) => x.priority - y.priority);
  for (const batch of sorted) {
    for (const row of batch.ratings) {
      const firm = row.firm.trim();
      const rating = cleanRatingLabel(row.rating);
      if (!firm || !rating || !isRecognizedRating(rating)) continue;
      const cleaned: AnalystRating = {
        firm,
        analyst: row.analyst?.trim() || null,
        rating,
        action: row.action?.trim() || null,
        date: row.date || null,
      };
      const key = normalizeFirmKey(firm);
      if (!key) continue;
      const prev = byFirm.get(key);
      if (!prev) {
        byFirm.set(key, { row: cleaned, priority: batch.priority, source: batch.source });
        usedSources.add(batch.source);
        continue;
      }
      const da = ratingDateMs(cleaned.date);
      const db = ratingDateMs(prev.row.date);
      if (da > db) {
        byFirm.set(key, { row: cleaned, priority: batch.priority, source: batch.source });
        usedSources.add(batch.source);
      } else if (da === db) {
        // Same day: prefer higher-priority source, then named analyst.
        if (
          batch.priority < prev.priority ||
          (batch.priority === prev.priority &&
            preferAnalystRow(cleaned, prev.row) === cleaned)
        ) {
          byFirm.set(key, { row: cleaned, priority: batch.priority, source: batch.source });
          usedSources.add(batch.source);
        }
      }
    }
  }

  const ratings = [...byFirm.values()]
    .map((e) => e.row)
    .sort((a, b) => ratingDateMs(b.date) - ratingDateMs(a.date))
    .slice(0, ANALYST_DISPLAY_LIMIT);

  // Preserve source order by priority for the attribution string.
  const sourceOrder = sorted.map((b) => b.source);
  const sources = sourceOrder.filter((s) => usedSources.has(s));
  return { ratings, sources };
}

async function fetchAnalystsFromYahoo(): Promise<AnalystSourceResult | null> {
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

  const seen = new Set<string>();
  const ratings: AnalystRating[] = [];
  for (const row of history) {
    const firm = String(row.firm || "").trim();
    const rating = cleanRatingLabel(String(row.toGrade || ""));
    if (!firm || !rating || !isRecognizedRating(rating)) continue;
    const key = normalizeFirmKey(firm);
    if (!key || seen.has(key)) continue;
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
    if (ratings.length >= ANALYST_DISPLAY_LIMIT) break;
  }
  if (ratings.length === 0) return null;
  return {
    ratings,
    asOf: new Date().toISOString(),
    source: "Yahoo Finance",
    consensus: null,
  };
}

async function fetchAnalystsFromStockAnalysis(): Promise<AnalystSourceResult | null> {
  const res = await fetch("https://stockanalysis.com/stocks/hca/ratings/", {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const ratings: AnalystRating[] = [];
  // TipRanks payload embedded in the page (free view ~8 recent named ratings).
  const re =
    /\{action_rt:"([^"]*)",pt_now:[^,}]*,pt_old:[^,}]*,firm:"([^"]*)",analyst:"([^"]*)",slug:"[^"]*",date:"([^"]*)",rating_new:"([^"]*)"/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const firm = m[2]!.trim();
    const analyst = m[3]!.trim();
    const rating = cleanRatingLabel(m[5]!.trim());
    const date = m[4]!.trim();
    const action = m[1]!.trim();
    if (!firm || !rating || !isRecognizedRating(rating)) continue;
    const key = normalizeFirmKey(firm);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ratings.push({
      firm,
      analyst: analyst || null,
      rating,
      action: action || null,
      date: date || null,
    });
    if (ratings.length >= ANALYST_DISPLAY_LIMIT) break;
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

async function fetchAnalystsFromMarketBeat(): Promise<AnalystSourceResult | null> {
  const res = await fetch("https://www.marketbeat.com/stocks/NYSE/HCA/forecast/", {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const tableMatch = html.match(/id="history-table"([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;
  const rows = tableMatch[1]!.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const seen = new Set<string>();
  const ratings: AnalystRating[] = [];

  for (const row of rows) {
    if (!/data-sort-value="/i.test(row)) continue;

    const dateSort = row.match(/<td[^>]*data-sort-value="(\d{8})/i);
    let date: string | null = null;
    if (dateSort) {
      const s = dateSort[1]!;
      date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }

    const firmClean = row.match(
      /<td[^>]*data-clean="([^"|]+)(?:\|[^"]*)?"[^>]*>[\s\S]*?ratings\/by-issuer/i,
    );
    const firm =
      firmClean?.[1]?.trim() ||
      row.match(/ratings\/by-issuer\/[^"]+"[^>]*>\s*([^<]+)/i)?.[1]?.trim() ||
      "";
    if (!firm) continue;

    const cleans = [...row.matchAll(/<td[^>]*data-clean="([^"]*)"/gi)].map((x) => x[1] || "");
    let analyst: string | null = null;
    if (cleans.length >= 2) {
      const a = (cleans[1] || "").split("|")[0]?.trim() || "";
      if (a && !/^subscribe/i.test(a) && !isRecognizedRating(a)) analyst = a;
    }

    const marker = row.match(/rating-marker[^"]*">\s*([^<]+)/i)?.[1]?.trim();
    let rating: string | null = marker ? cleanRatingLabel(marker) : null;
    if (!rating) {
      for (const c of cleans) {
        if (!c.includes("|")) continue;
        const [, neu] = c.split("|", 2);
        const candidate = cleanRatingLabel((neu || "").trim());
        if (candidate && isRecognizedRating(candidate)) {
          rating = candidate;
          break;
        }
        const left = cleanRatingLabel(c.split("|", 1)[0]!.trim());
        if (left && isRecognizedRating(left)) {
          rating = left;
          break;
        }
      }
    }
    if (!rating || !isRecognizedRating(rating)) continue;

    const actionText =
      row.match(
        /<\/td>\s*<td>([^<]*(?:Target|Upgrade|Downgrade|Reiterat|Initiat|Maintain|Coverage)[^<]*)<\/td>/i,
      )?.[1]?.trim() || null;

    const key = normalizeFirmKey(firm);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ratings.push({
      firm,
      analyst,
      rating,
      action: actionText,
      date,
    });
  }

  if (ratings.length === 0) return null;

  const consensus =
    html.match(/class="rating-title">\s*([^<]+)/i)?.[1]?.trim() || null;

  return {
    ratings,
    asOf: new Date().toISOString(),
    source: "MarketBeat",
    consensus,
  };
}

async function fetchAnalystsFromFinviz(): Promise<AnalystSourceResult | null> {
  const res = await fetch(`https://finviz.com/quote.ashx?t=${SYMBOL}`, {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const rows = html.match(/<tr[^>]*class="styled-row[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const seen = new Set<string>();
  const ratings: AnalystRating[] = [];

  for (const row of rows) {
    if (!/Upgrade|Downgrade|Initiated|Reiterated/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]!
        .replace(/<[^>]+>/g, " ")
        .replace(/&(?:rarr|arr);/gi, "→")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (cells.length < 4) continue;
    const dateRaw = cells[0] || "";
    const action = cells[1] || null;
    const firm = cells[2] || "";
    const rating = cleanRatingLabel(cells[3] || "");
    if (!firm || !rating || !isRecognizedRating(rating)) continue;

    let date: string | null = null;
    const dm = dateRaw.match(/^([A-Za-z]{3})-(\d{2})-(\d{2})$/);
    if (dm) {
      const months: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      const mon = months[dm[1]!];
      if (mon) date = `20${dm[3]}-${mon}-${dm[2]}`;
    }

    const key = normalizeFirmKey(firm);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ratings.push({ firm, analyst: null, rating, action, date });
    if (ratings.length >= ANALYST_DISPLAY_LIMIT) break;
  }

  if (ratings.length === 0) return null;
  return {
    ratings,
    asOf: new Date().toISOString(),
    source: "Finviz",
    consensus: null,
  };
}

export async function fetchHcaAnalysts() {
  if (analystsCache && analystsCache.expires > Date.now()) {
    return analystsCache.body;
  }

  const batches: Array<{ ratings: AnalystRating[]; source: string; priority: number }> = [];
  let consensus: string | null = null;
  let asOf = new Date().toISOString();

  const settled = await Promise.allSettled([
    fetchAnalystsFromStockAnalysis(),
    fetchAnalystsFromMarketBeat(),
    fetchAnalystsFromYahoo(),
    fetchAnalystsFromFinviz(),
  ]);

  const priorities = [
    { sourceLabel: "Stock Analysis (TipRanks)", priority: 1 },
    { sourceLabel: "MarketBeat", priority: 2 },
    { sourceLabel: "Yahoo Finance", priority: 3 },
    { sourceLabel: "Finviz", priority: 4 },
  ];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    const meta = priorities[i]!;
    if (result.status === "rejected") {
      console.warn(`[finance] ${meta.sourceLabel} analysts failed:`, result.reason);
      continue;
    }
    const value = result.value;
    if (!value || value.ratings.length === 0) continue;
    batches.push({
      ratings: value.ratings,
      source: value.source,
      priority: meta.priority,
    });
    if (!consensus && value.consensus) consensus = value.consensus;
    // Prefer Stock Analysis asOf when present.
    if (meta.priority === 1 && value.asOf) asOf = value.asOf;
  }

  const merged = mergeAnalystRatings(batches);
  let body: unknown;

  if (merged.ratings.length > 0) {
    body = {
      symbol: SYMBOL,
      ratings: merged.ratings,
      consensus,
      asOf,
      source: merged.sources.join(" + "),
      limit: ANALYST_DISPLAY_LIMIT,
      note:
        "TipRanks via Stock Analysis free page lists ~8 recent named ratings; " +
        "additional distinct firms come from MarketBeat (most-recent-per-brokerage), " +
        "Yahoo upgrade/downgrade history, and Finviz when available. " +
        `Display capped at ${ANALYST_DISPLAY_LIMIT} firms.`,
    };
  } else {
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
