/**
 * Pull live HCA finance signals from Parigrado's finance proxy and turn recent
 * analyst / price moves into financial-news cards for the HCA dashboard.
 */
const DEFAULT_BASE = process.env.PARIGRADO_BASE_URL || "https://parigrado.com";
const FRESH_MS = 45 * 24 * 60 * 60 * 1000; // prefer items within ~45 days
const YAHOO_ANALYSIS = "https://finance.yahoo.com/quote/HCA/analysis/";
const YAHOO_QUOTE = "https://finance.yahoo.com/quote/HCA/";

function monthDayYear(isoOrDate) {
  const d =
    typeof isoOrDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(isoOrDate)
      ? new Date(`${isoOrDate.slice(0, 10)}T12:00:00Z`)
      : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Parigrado-HCA-Updater/1.0" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/** Fetch chart + analysts (+ optional insiders) from the live site. */
export async function fetchFinanceSignals(baseUrl = DEFAULT_BASE) {
  const base = String(baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const out = { quote: null, ratings: [], insiders: [], errors: [] };
  try {
    out.quote = await getJson(`${base}/api/finance/hca/chart?range=5d`);
  } catch (err) {
    out.errors.push(`chart: ${err instanceof Error ? err.message : err}`);
  }
  try {
    const a = await getJson(`${base}/api/finance/hca/analysts`);
    out.ratings = Array.isArray(a?.ratings) ? a.ratings : [];
  } catch (err) {
    out.errors.push(`analysts: ${err instanceof Error ? err.message : err}`);
  }
  try {
    const i = await getJson(`${base}/api/finance/hca/insiders`);
    out.insiders = Array.isArray(i?.transactions) ? i.transactions : [];
  } catch (err) {
    out.errors.push(`insiders: ${err instanceof Error ? err.message : err}`);
  }
  return out;
}

function accountabilityForAnalyst(firm, rating, action) {
  return [
    `${firm} ${String(action || "rated").toLowerCase()} HCA at ${rating} while Mission Hospital remains under federal noncompliance findings — Wall Street and WNC patients are living in different realities.`,
    "Analyst support for HCA stock reflects confidence in the profit model, including monopoly pricing power in markets like Asheville, not Mission's staffing or safety record.",
    "Ask HCA whether investor communications will address Mission's missing staffing plans and AG lawsuit exposure alongside buy-side ratings.",
  ];
}

function cardFromRating(r) {
  const dateLabel = monthDayYear(r.date);
  if (!dateLabel) return null;
  const firm = String(r.firm || "Analyst").trim();
  const rating = String(r.rating || "N/A").trim();
  const action = String(r.action || "Update").trim();
  const analyst = r.analyst ? String(r.analyst).trim() : null;
  const who = analyst ? `${firm} (${analyst})` : firm;
  const headline = `${firm} ${action} on HCA — ${rating}`;
  const blurb = `${who} ${action.toLowerCase()} HCA Healthcare with a ${rating} rating on ${dateLabel}. Street coverage continues between quarterly earnings reports even as Mission Hospital faces federal monitoring and the NC AG lawsuit.`;
  return {
    source: firm,
    date: dateLabel,
    tag: /initiat/i.test(action) ? "Initiation" : "Analyst",
    tagClass: "tag-amber",
    headline,
    blurb,
    brief: blurb,
    accountabilityPoints: accountabilityForAnalyst(firm, rating, action),
    url: YAHOO_ANALYSIS,
    _signal: "analyst",
  };
}

function cardFromQuote(quote) {
  if (!quote || quote.price == null) return null;
  const price = Number(quote.price);
  const ch = Number(quote.change);
  const pct = Number(quote.changePercent);
  if (!Number.isFinite(price)) return null;
  const today = monthDayYear(new Date());
  const dir = Number.isFinite(ch) ? (ch > 0 ? "up" : ch < 0 ? "down" : "flat") : "flat";
  const chTxt =
    Number.isFinite(ch) && Number.isFinite(pct)
      ? `${ch >= 0 ? "+" : ""}${ch.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`
      : "unchanged";
  const headline = `HCA shares ${dir === "flat" ? "steady" : dir} at $${price.toFixed(2)}`;
  const blurb = `HCA Healthcare (NYSE: HCA) last traded near $${price.toFixed(2)}, ${chTxt} on the session. Equity markets continue to price HCA on national earnings and capital returns, separate from Mission Hospital's local compliance and lawsuit exposure.`;
  return {
    source: "Market quote",
    date: today,
    tag: "Stock",
    tagClass: "tag-amber",
    headline,
    blurb,
    brief: blurb,
    accountabilityPoints: [
      "Daily HCA stock moves reward the company's national margin story — they do not measure whether Mission Hospital is restoring staffing or meeting federal monitor requirements.",
      `At about $${price.toFixed(0)} per share, HCA's equity value dwarfs the capital HCA has publicly tied to WNC staffing recovery.`,
      "Advocates can use market focus on buybacks and EPS as a contrast: investors get capital returns while Mission's federal monitor reported no staffing plans submitted.",
    ],
    url: YAHOO_QUOTE,
    _signal: "quote",
  };
}

function cardFromInsider(tx) {
  if (!tx?.date || !tx?.filer) return null;
  const dateLabel = monthDayYear(tx.date);
  if (!dateLabel) return null;
  const t = Date.parse(`${String(tx.date).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t) || Date.now() - t > FRESH_MS) return null;
  // Skip routine tax withholdings / tiny awards; keep sales and large gifts.
  const typ = String(tx.type || "");
  if (/tax|award/i.test(typ) && !(tx.value > 1_000_000)) return null;
  const shares = tx.shares != null ? Number(tx.shares).toLocaleString("en-US") : "—";
  const headline = `HCA insider filing: ${tx.filer} — ${typ || "transaction"} (${shares} shares)`;
  const blurb = `${tx.filer}${tx.role ? ` (${tx.role})` : ""} reported a ${typ || "share"} transaction of ${shares} HCA shares dated ${dateLabel}. Insider activity is a capital-markets signal distinct from Mission Hospital's care and compliance record in western North Carolina.`;
  return {
    source: "SEC Form 4",
    date: dateLabel,
    tag: "Insider",
    tagClass: "tag-amber",
    headline,
    blurb,
    brief: blurb,
    accountabilityPoints: [
      "Insider Form 4 activity is tracked by markets; Mission's federal noncompliance and AG lawsuit rarely appear in the same investor narratives.",
      "Use insider and buyback headlines to ask why capital allocation and equity incentives outpace public staffing recovery commitments at Mission.",
      "WNC patients experience HCA through wait times and safety citations — not through Form 4 filings in Nashville.",
    ],
    url: YAHOO_QUOTE,
    _signal: "insider",
  };
}

/** Build candidate financial cards from live finance API payloads. */
export function financeSignalsToCards(signals) {
  const cards = [];
  const now = Date.now();
  const ratings = (signals?.ratings || [])
    .filter((r) => r?.date)
    .filter((r) => {
      const t = Date.parse(`${String(r.date).slice(0, 10)}T12:00:00Z`);
      return Number.isFinite(t) && now - t <= FRESH_MS;
    })
    .slice(0, 4);
  for (const r of ratings) {
    const card = cardFromRating(r);
    if (card) cards.push(card);
  }
  const quoteCard = cardFromQuote(signals?.quote);
  if (quoteCard) cards.push(quoteCard);
  const insiderCard = cardFromInsider(signals?.insiders?.[0]);
  if (insiderCard) cards.push(insiderCard);
  return cards;
}

/** Short bullet list for the Anthropic user prompt. */
export function formatFinanceSignalsForPrompt(signals) {
  const lines = [];
  const q = signals?.quote;
  if (q?.price != null) {
    lines.push(
      `- Live quote: HCA $${Number(q.price).toFixed(2)} (chg ${q.change ?? "n/a"} / ${q.changePercent ?? "n/a"}%)`,
    );
  }
  for (const r of (signals?.ratings || []).slice(0, 6)) {
    lines.push(
      `- Analyst ${r.date}: ${r.firm}${r.analyst ? ` / ${r.analyst}` : ""} — ${r.action || "Update"} → ${r.rating}`,
    );
  }
  for (const tx of (signals?.insiders || []).slice(0, 3)) {
    lines.push(
      `- Insider ${tx.date}: ${tx.filer} ${tx.type || "txn"} ${tx.shares ?? "?"} shares`,
    );
  }
  if (!lines.length) return "";
  return `LIVE FINANCE SIGNALS (from Parigrado finance API — use these to keep financialNewsItems fresh; write full cards for the newest analyst actions and search for matching MarketBeat/IR coverage when possible):\n${lines.join("\n")}`;
}

function dedupeKey(item) {
  const h = String(item?.headline || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
  const d = String(item?.date || "").trim();
  return `${d}|${h}`;
}

/**
 * Merge model financial items with API-derived cards.
 * Ensures the column isn't stuck on months-old earnings recycle when fresher
 * analyst/stock signals exist.
 */
export function enrichFinancialNewsItems(aiItems, signalCards, parseNewsDate, opts = {}) {
  const max = opts.max ?? 5;
  const freshMs = opts.freshMs ?? FRESH_MS;
  const now = Date.now();
  const ai = Array.isArray(aiItems) ? [...aiItems] : [];
  const signals = Array.isArray(signalCards) ? [...signalCards] : [];

  const freshAi = ai.filter((it) => {
    const t = parseNewsDate(it?.date);
    return t > 0 && now - t <= freshMs;
  });
  const staleAi = ai.filter((it) => !freshAi.includes(it));

  // Prefer: fresh AI stories, then signal cards, then a couple of evergreen/stale AI items.
  const merged = [];
  const seen = new Set();
  const push = (item) => {
    if (!item?.headline) return;
    const key = dedupeKey(item);
    if (seen.has(key)) return;
    // Also skip near-duplicate firm+date analyst cards
    const loose = `${String(item.date)}|${String(item.source)}|${String(item.tag)}`.toLowerCase();
    if (seen.has(loose)) return;
    seen.add(key);
    seen.add(loose);
    const copy = { ...item };
    delete copy._signal;
    merged.push(copy);
  };

  for (const it of freshAi) push(it);
  for (const it of signals) push(it);
  for (const it of staleAi) {
    if (merged.length >= max) break;
    push(it);
  }

  // If still empty, keep whatever AI returned
  if (merged.length === 0) return ai.slice(0, max);

  return merged
    .map((item, index) => ({ item, index, t: parseNewsDate(item?.date) }))
    .sort((a, b) => b.t - a.t || a.index - b.index)
    .map(({ item }) => item)
    .slice(0, max);
}
