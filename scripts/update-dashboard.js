#!/usr/bin/env node
/**
 * Refresh HCA / Mission dashboard news + talking points via Anthropic.
 * Usage (from repo root): npm run update:hca
 * Or: node scripts/update-dashboard.js
 *
 * Live URL: https://parigrado.com/hca/
 * HTML path: public/hca/index.html
 * Hosted via Parigrado/Render (not GitHub Pages).
 * Workflow: .github/workflows/update-dashboard.yml
 *
 * Requires ANTHROPIC_API_KEY. Optional: DASHBOARD_HTML (default public/hca/index.html)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BACKGROUND_FACTS = `BACKGROUND FACTS (established advocacy context for the Watchdog page; do not invent conflicting history; prefer fresh news for current items):
- HCA Healthcare is a Fortune 100 for-profit hospital company.
- HCA acquired Mission Hospital (Asheville, NC) in 2019 for $1.5B.
- Mission has received 4 Immediate Jeopardy citations from CMS since the acquisition (2021, 2024, 2025, 2026).
- Mission HCAHPS patient experience has been 2 stars every year 2020–2024 — lowest of all CON applicants.
- Over 200 physicians and 600 nurses have left Mission since 2019 (800+ clinical staff total).
- Staff ratio dropped from 6.1 FTE/bed to 3.7 FTE (NC average 5.1). (The Parigrado dashboard also publishes HCRIS staffing series; treat these FTE figures as advocacy narrative facts for the Watchdog page.)
- NC Attorney General Jeff Jackson sued HCA for violating acquisition commitments; a judge denied summary judgment on July 28, 2026, and the lawsuit proceeds.
- Federal monitor (July 2026): Mission is not in substantial compliance; no staffing plans submitted.
- August 4, 2026: Dogwood Health Trust and Affiliated Monitors hosted a community Q&A webinar on the 2025 HCA Mission monitoring report (90+ attendees). Source: https://dogwoodhealthtrust.org/independent-monitor-dogwood-host-community-qa-webinar-on-2025-monitoring-report/
- NC DHHS awarded Mission 95 CON beds despite active federal safety sanctions.
- April 28, 2026: HCA CEO Sam Hazen testified before the House Ways and Means Committee (hearing with health system CEOs). Written testimony focused on affordability, uncompensated care, Helene response in western NC, workforce training, and eliminating certificate-of-need (CON) laws. It did not address Mission Immediate Jeopardy citations, staffing collapse, federal noncompliance, or the AG lawsuit. Primary sources: https://www.congress.gov/event/119th-congress/house-event/119239 and https://www.congress.gov/119/meeting/house/119239/witnesses/HHRG-119-WM00-Wstate-HazenS-20260428.pdf (also hosted at /hca/hazen-hca-testimony-2026-04-28.pdf on this site).`;

const SYSTEM_PROMPT = `You are a research assistant for Reclaim Healthcare WNC, a nonprofit holding HCA Healthcare accountable for poor care at Mission Hospital in Asheville NC. Your job is to generate updated content for their public watchdog dashboard.

Mission context: HCA acquired Mission in 2019, has received 4 Immediate Jeopardy citations, Mission has 2-star HCAHPS ratings 2020-2024, 800+ staff have left, staffing ratio fell from 6.1 to 3.7 FTE per bed vs 5.1 NC average. NC AG lawsuit advancing after July 28 2026 summary judgment denial. Federal monitor confirmed noncompliance July 2026. For the AG case, prefer "lawsuit" (not "trial") in tags and short notes when framing the case.

${BACKGROUND_FACTS}

Generate updated dashboard content based on the most recent news you are aware of. Search for the latest news about HCA Healthcare, Mission Hospital Asheville, NC Attorney General lawsuit against HCA, CMS compliance status, HCA earnings, and relevant congressional hearings or CEO testimony (including Sam Hazen / Ways and Means) when tools are available.

KEY OUTLETS TO CHECK (when searching): Asheville Watchdog, Blue Ridge Public Radio (BPR), NC Health News, Becker's Hospital Review (https://www.beckershospitalreview.com/ — HCA / Mission / for-profit hospital coverage), Dogwood Health Trust (https://dogwoodhealthtrust.org/ — Independent Monitor reports, community webinars, Mission sale compliance), NC DOJ / AG, CMS, HCA investor relations, National Nurses United, and related congressional coverage. Prefer primary publisher URLs. Always consider Dogwood / Affiliated Monitors Independent Monitor updates when fresh.

IMPORTANT COLUMN SPLIT:
- newsItems = accountability / care / CMS / lawsuit / staffing / CON / congressional oversight / advocacy framing for Mission and WNC. Do NOT put pure earnings/stock items here.
- financialNewsItems = purely financial headlines about HCA: earnings, revenue, cost cutting, margins, guidance, buybacks, dividends, stock, analyst price targets, capital allocation. Do NOT put CMS citations, AG lawsuit, staffing, or patient-safety advocacy items here.

CONGRESSIONAL / HAZEN TESTIMONY:
- When relevant (or when little fresher Mission news exists), include Hazen's April 28, 2026 Ways and Means testimony or related hearing coverage in newsItems and/or a talking point.
- Do NOT invent quotes. Prefer short accurate paraphrases with attribution. The written testimony is largely defensive PR; usable accountability angles include: (1) Hazen urged eliminating CON laws while Mission had just won 95 CON beds amid sanctions; (2) he highlighted Helene/WNC response and patient-safety capital without addressing Mission IJ citations, staffing, monitor noncompliance, or the AG lawsuit.
- Link to the Congress.gov hearing page or the official written-testimony PDF when citing this material.

ORDERING: Return newsItems and financialNewsItems newest-first (most recent date at index 0, declining age). Use "Month D, YYYY" dates when known.

Return ONLY a valid raw JSON object with exactly this structure, no markdown, no backticks, no preamble:
{
  todayDate: "Month D, YYYY",
  sectionLabel: "Recent news — Month D, YYYY",
  financialSectionLabel: "Recent financial news — Month D, YYYY",
  newsItems: [
    {
      source: "Source name",
      date: "Month D, YYYY",
      tag: "Tag text",
      tagClass: "tag-red or tag-amber or tag-blue or tag-teal",
      headline: "Headline text",
      blurb: "Two to three sentence summary with Reclaim framing",
      brief: "2–4 sentence article brief for the click modal (accountability-aware)",
      accountabilityPoints: ["2–4 short Reclaim positioning bullets for advocates"],
      url: "https://real-article-url-when-known (optional; omit if unknown — never invent)"
    }
  ],
  financialNewsItems: [
    {
      source: "Source name",
      date: "Month D, YYYY",
      tag: "Tag text",
      tagClass: "tag-red or tag-amber or tag-blue or tag-teal",
      headline: "Headline text",
      blurb: "Two to three sentence summary focused on financial facts",
      brief: "2–4 sentence article brief for the click modal",
      accountabilityPoints: ["2–4 short positioning bullets connecting earnings/margins/buybacks to Mission accountability"],
      url: "https://real-article-url-when-known (optional; omit if unknown — never invent)"
    }
  ],
  talkingPoints: [
    {
      text: "Bold lead phrase. Rest of talking point.",
      source: "Optional short source name when citing a document/article",
      sourceUrl: "https://real-source-url-when-known (optional; omit if unknown — never invent)",
      url: "https://same-as-sourceUrl-or-primary-link (optional alias)"
    }
  ]
}

URL RULES:
- Include a real https URL for newsItems[].url / financialNewsItems[].url whenever you know a specific article, press release, court filing, congressional hearing page, or official page for that story.
- For talkingPoints, when the point cites a report, earnings release, court ruling, congressional testimony, or news article, set source + sourceUrl (or url) to that document. Preserve real sourceUrl/url values — never drop a known good link.
- Prefer the primary publisher URL (news outlet, court PDF, Congress.gov, company IR, CMS/agency page). Do NOT invent, guess, or fabricate URLs. If unsure, omit the field entirely (plain text, no placeholder links).

BRIEF RULES (required for every newsItems[] and financialNewsItems[] entry):
- brief: 2–4 sentences summarizing the article for a modal shown before the user leaves the page. Accurate; no invented quotes.
- accountabilityPoints: REQUIRED array of 2–4 short strings — Reclaim positioning / talking points shown under each card blurb and in the click-modal. Frame for advocates holding HCA accountable (Mission quality, staffing, safety, CON, AG lawsuit, profits vs care, congressional framing, etc.). For financialNewsItems, every bullet should connect earnings/revenue/cost-cutting/margins/guidance/buybacks/stock news to Mission accountability (e.g. profits vs staffing, capital returns vs missing staffing plans, IR silence on CMS/AG).`;

function resolveHtmlPath() {
  const override = process.env.DASHBOARD_HTML;
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(ROOT, override);
  }
  return path.join(ROOT, "public", "hca", "index.html");
}

function requireApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set.\n" +
        "Export your key before running, e.g.:\n" +
        "  export ANTHROPIC_API_KEY=sk-ant-...\n" +
        "  npm run update:hca",
    );
    process.exit(1);
  }
  return key.trim();
}

function extractText(content) {
  if (!Array.isArray(content)) return "";
  const texts = content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean);
  if (!texts.length) return "";
  // With web_search, earlier text blocks are often search narration.
  // Prefer the last block that looks like JSON; otherwise join all.
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (t.includes("{") && (t.includes('"newsItems"') || t.includes("newsItems"))) {
      return t;
    }
  }
  const withBrace = [...texts].reverse().find((t) => t.includes("{"));
  return withBrace || texts.join("\n");
}

/** Extract balanced {...} candidates from mixed prose + JSON. */
function extractJsonObjectCandidates(text) {
  const candidates = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return candidates;
}

function parseJsonResponse(raw) {
  let text = (raw || "").trim();
  if (!text) {
    throw new Error("Failed to parse model JSON: empty response");
  }

  // Strip markdown fences (whole response or embedded)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) text = fence[1].trim();

  const attempts = [];
  if (text.startsWith("{")) attempts.push(text);
  // Prefer last balanced object (final answer after narration)
  const objects = extractJsonObjectCandidates(text);
  for (let i = objects.length - 1; i >= 0; i--) attempts.push(objects[i]);
  // Legacy slice fallback
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) attempts.push(text.slice(start, end + 1));

  const seen = new Set();
  let lastErr;
  for (const candidate of attempts) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `Failed to parse model JSON: ${lastErr?.message || "no JSON object found"}\n--- raw ---\n${raw.slice(0, 2000)}`,
  );
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeOptionalUrl(value) {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!isHttpUrl(trimmed)) return undefined;
  return trimmed;
}

function normalizeAccountabilityPoints(value, label, i) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${label}[${i}].accountabilityPoints must be an array when provided`);
  }
  const points = value
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => p.trim())
    .slice(0, 6);
  return points.length ? points : undefined;
}

function validateNewsItem(item, label, i) {
  for (const key of ["source", "date", "tag", "headline", "blurb"]) {
    if (typeof item[key] !== "string" || !item[key].trim()) {
      throw new Error(`${label}[${i}].${key} must be a non-empty string`);
    }
  }
  if (item.brief != null && item.brief !== "") {
    if (typeof item.brief !== "string" || !item.brief.trim()) {
      throw new Error(`${label}[${i}].brief must be a non-empty string when provided`);
    }
    item.brief = item.brief.trim();
  } else {
    // Fall back to blurb so modal payloads survive older model responses
    item.brief = String(item.blurb).trim();
  }
  // Accept positioningPoints as an alias; canonicalize to accountabilityPoints
  if (item.accountabilityPoints == null && item.positioningPoints != null) {
    item.accountabilityPoints = item.positioningPoints;
  }
  delete item.positioningPoints;
  const points = normalizeAccountabilityPoints(item.accountabilityPoints, label, i);
  if (!points || points.length < 2) {
    throw new Error(
      `${label}[${i}].accountabilityPoints must be an array of 2–4 short positioning bullets`,
    );
  }
  item.accountabilityPoints = points.slice(0, 4);
  if (item.url != null && item.url !== "") {
    if (!isHttpUrl(item.url)) {
      throw new Error(`${label}[${i}].url must be a valid http(s) URL when provided`);
    }
    item.url = item.url.trim();
  } else {
    delete item.url;
  }
}

function validatePayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Model response is not a JSON object");
  }
  if (typeof data.todayDate !== "string" || !data.todayDate.trim()) {
    throw new Error("todayDate must be a non-empty string");
  }
  if (typeof data.sectionLabel !== "string" || !data.sectionLabel.trim()) {
    throw new Error("sectionLabel must be a non-empty string");
  }
  if (!Array.isArray(data.newsItems) || data.newsItems.length === 0) {
    throw new Error("newsItems must be a non-empty array");
  }
  if (!Array.isArray(data.talkingPoints) || data.talkingPoints.length === 0) {
    throw new Error("talkingPoints must be a non-empty array");
  }
  // financialNewsItems: required non-empty when present; allow empty array only if key missing (legacy)
  if (data.financialNewsItems != null) {
    if (!Array.isArray(data.financialNewsItems) || data.financialNewsItems.length === 0) {
      throw new Error("financialNewsItems must be a non-empty array when provided");
    }
    for (const [i, item] of data.financialNewsItems.entries()) {
      validateNewsItem(item, "financialNewsItems", i);
    }
  } else {
    data.financialNewsItems = [];
  }
  if (
    typeof data.financialSectionLabel !== "string" ||
    !data.financialSectionLabel.trim()
  ) {
    data.financialSectionLabel = `Recent financial news — ${data.todayDate.trim()}`;
  }
  for (const [i, item] of data.newsItems.entries()) {
    validateNewsItem(item, "newsItems", i);
  }
  for (const [i, tp] of data.talkingPoints.entries()) {
    if (typeof tp?.text !== "string" || !tp.text.trim()) {
      throw new Error(`talkingPoints[${i}].text must be a non-empty string`);
    }
    const sourceUrl = normalizeOptionalUrl(tp.sourceUrl) || normalizeOptionalUrl(tp.url);
    if (tp.sourceUrl != null && tp.sourceUrl !== "" && !sourceUrl) {
      throw new Error(
        `talkingPoints[${i}].sourceUrl must be a valid http(s) URL when provided`,
      );
    }
    if (tp.url != null && tp.url !== "" && !normalizeOptionalUrl(tp.url) && !sourceUrl) {
      throw new Error(`talkingPoints[${i}].url must be a valid http(s) URL when provided`);
    }
    if (sourceUrl) {
      tp.sourceUrl = sourceUrl;
    } else {
      delete tp.sourceUrl;
    }
    // Keep optional url as alias of sourceUrl for callers that set only url
    if (normalizeOptionalUrl(tp.url)) {
      tp.url = normalizeOptionalUrl(tp.url);
    } else if (sourceUrl) {
      tp.url = sourceUrl;
    } else {
      delete tp.url;
    }
    if (typeof tp.source === "string" && tp.source.trim()) {
      tp.source = tp.source.trim();
    } else {
      delete tp.source;
    }
  }
  return data;
}

/** Parse news dates like "July 28, 2026", "July 2026", or ISO "2026-07-28". Unparseable → 0. */
function parseNewsDate(value) {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const t = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(t) ? 0 : t;
  }

  const monthDayYear = raw.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})$/i,
  );
  if (monthDayYear) {
    const t = Date.parse(
      `${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]} UTC`,
    );
    return Number.isNaN(t) ? 0 : t;
  }

  const monthYear = raw.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
  );
  if (monthYear) {
    const t = Date.parse(`${monthYear[1]} 1, ${monthYear[2]} UTC`);
    return Number.isNaN(t) ? 0 : t;
  }

  const fallback = Date.parse(raw);
  return Number.isNaN(fallback) ? 0 : fallback;
}

/** Newest → oldest. Stable for equal/unparseable dates. */
function sortNewsItemsByDateDesc(items) {
  if (!Array.isArray(items) || items.length < 2) return items || [];
  return items
    .map((item, index) => ({ item, index, t: parseNewsDate(item?.date) }))
    .sort((a, b) => b.t - a.t || a.index - b.index)
    .map(({ item }) => item);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inferTagClass(tag) {
  const t = String(tag).toLowerCase();
  if (
    /trial|lawsuit|suit|noncompliance|jeopardy|safety|citation|sanction|violation|staff|death|harm/.test(
      t,
    )
  ) {
    return "tag-red";
  }
  if (
    /earnings|revenue|profit|con|financial|investor|beds|award|margin|guidance|buyback|dividend|stock/.test(
      t,
    )
  ) {
    return "tag-amber";
  }
  if (
    /legal|court|ag|advocacy|media|press|politics|policy|congress|hearing|testimony|capitol/.test(
      t,
    )
  ) {
    return "tag-blue";
  }
  if (/monitor|compliance|update|progress|cms|deadline/.test(t)) {
    return "tag-teal";
  }
  return "tag-amber";
}

function resolveTagClass(item) {
  const allowed = new Set(["tag-red", "tag-amber", "tag-blue", "tag-teal"]);
  const fromModel = typeof item.tagClass === "string" ? item.tagClass.trim() : "";
  if (allowed.has(fromModel)) return fromModel;
  return inferTagClass(item.tag);
}

function formatTalkingPointText(text) {
  const cleaned = String(text).trim();
  // **Title** rest
  const md = cleaned.match(/^\*\*(.+?)\*\*\s*(.*)$/s);
  if (md) {
    const rest = md[2].trim();
    return rest
      ? `<strong>${escapeHtml(md[1])}</strong> ${escapeHtml(rest)}`
      : `<strong>${escapeHtml(md[1])}</strong>`;
  }
  // First sentence in <strong>, rest plain
  const m = cleaned.match(/^(.+?[.!?])\s+(.+)$/s);
  if (m) {
    return `<strong>${escapeHtml(m[1])}</strong> ${escapeHtml(m[2])}`;
  }
  return `<strong>${escapeHtml(cleaned)}</strong>`;
}

function externalLinkAttrs() {
  return 'target="_blank" rel="noopener noreferrer"';
}

function renderExternalLink(href, label, className) {
  const cls = className ? ` class="${className}"` : "";
  return `<a href="${escapeHtml(href)}"${cls} ${externalLinkAttrs()}>${escapeHtml(label)}</a>`;
}

function getAccountabilityPoints(item) {
  return Array.isArray(item.accountabilityPoints)
    ? item.accountabilityPoints.filter((p) => typeof p === "string" && p.trim()).slice(0, 4)
    : [];
}

function renderAccountabilityList(points) {
  if (!points.length) return "";
  return `        <div class="news-positioning">
          <div class="news-positioning-label">How to position this</div>
          <ul class="news-accountability">
${points.map((p) => `            <li>${escapeHtml(p.trim())}</li>`).join("\n")}
          </ul>
        </div>`;
}

function renderNewsBriefPayload(item) {
  const brief =
    typeof item.brief === "string" && item.brief.trim()
      ? item.brief.trim()
      : String(item.blurb || "").trim();
  // Points are rendered visibly under the blurb; modal reads those same <li>s.
  // Keep brief-only in the hidden payload.
  return `        <div class="news-brief-payload" hidden>
          <p class="news-brief-text">${escapeHtml(brief)}</p>
        </div>`;
}

function renderNewsItems(items) {
  return items
    .map((item) => {
      const url = normalizeOptionalUrl(item.url);
      const sourceHtml = url
        ? renderExternalLink(url, item.source, "news-source news-link")
        : `<span class="news-source">${escapeHtml(item.source)}</span>`;
      const headlineHtml = url
        ? `<h2 class="news-headline">${renderExternalLink(url, item.headline, "news-link")}</h2>`
        : `<h2 class="news-headline">${escapeHtml(item.headline)}</h2>`;
      const pointsHtml = renderAccountabilityList(getAccountabilityPoints(item));
      return `      <article class="news-item">
        <div class="news-meta">
          ${sourceHtml}
          <span class="news-date">${escapeHtml(item.date)}</span>
          <span class="tag ${resolveTagClass(item)}">${escapeHtml(item.tag)}</span>
        </div>
        ${headlineHtml}
        <p class="news-blurb">${escapeHtml(item.blurb)}</p>
${pointsHtml ? `${pointsHtml}\n` : ""}${renderNewsBriefPayload(item)}
      </article>`;
    })
    .join("\n");
}

function renderTalkingPointSource(tp) {
  const href = normalizeOptionalUrl(tp.sourceUrl) || normalizeOptionalUrl(tp.url);
  if (!href) return "";
  const label =
    typeof tp.source === "string" && tp.source.trim() ? tp.source.trim() : "Source";
  return `<div class="tp-source">${renderExternalLink(href, label, "tp-source-link")}</div>`;
}

function renderTalkingPoints(points) {
  return points
    .map((tp, i) => {
      const sourceHtml = renderTalkingPointSource(tp);
      return `      <div class="tp-item">
        <div class="tp-num" aria-hidden="true">${i + 1}</div>
        <div class="tp-text">${formatTalkingPointText(tp.text)}${sourceHtml ? `\n          ${sourceHtml}` : ""}</div>
      </div>`;
    })
    .join("\n");
}

function replaceBetween(html, startMarker, endMarker, inner) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not find markers ${startMarker} … ${endMarker} in dashboard HTML`,
    );
  }
  const before = html.slice(0, start + startMarker.length);
  const after = html.slice(end);
  return `${before}\n${inner}\n      ${after}`;
}

function ensureMarkers(html) {
  let out = html;
  if (!out.includes("<!-- NEWS_START -->") || !out.includes("<!-- NEWS_END -->")) {
    // Wrap existing news articles if markers are missing
    const newsBody = out.match(
      /(<span class="section-header-label"[^>]*id="news-heading"[^>]*>[\s\S]*?<\/span>\s*<\/div>\s*<div class="section-body">)([\s\S]*?)(<\/div>\s*<\/section>)/i,
    );
    if (!newsBody) {
      throw new Error("Missing NEWS markers and could not locate news section to wrap");
    }
    out =
      out.slice(0, newsBody.index) +
      `${newsBody[1]}\n      <!-- NEWS_START -->${newsBody[2]}<!-- NEWS_END -->\n      ${newsBody[3]}` +
      out.slice(newsBody.index + newsBody[0].length);
  }
  if (!out.includes("<!-- FIN_NEWS_START -->") || !out.includes("<!-- FIN_NEWS_END -->")) {
    const finBody = out.match(
      /(<span class="section-header-label"[^>]*id="fin-news-heading"[^>]*>[\s\S]*?<\/span>\s*<\/div>\s*<div class="section-body">)([\s\S]*?)(<\/div>\s*<\/section>)/i,
    );
    if (!finBody) {
      throw new Error(
        "Missing FIN_NEWS markers and could not locate financial news section to wrap",
      );
    }
    out =
      out.slice(0, finBody.index) +
      `${finBody[1]}\n      <!-- FIN_NEWS_START -->${finBody[2]}<!-- FIN_NEWS_END -->\n      ${finBody[3]}` +
      out.slice(finBody.index + finBody[0].length);
  }
  if (!out.includes("<!-- TP_START -->") || !out.includes("<!-- TP_END -->")) {
    const tpBody = out.match(
      /(<span class="section-header-label"[^>]*>[\s\S]*?Talking points[\s\S]*?<\/span>\s*<\/div>\s*<div class="section-body">)([\s\S]*?)(<\/div>\s*<\/section>\s*<!-- ARC)/i,
    );
    if (!tpBody) {
      throw new Error("Missing TP markers and could not locate talking-points section to wrap");
    }
    out =
      out.slice(0, tpBody.index) +
      `${tpBody[1]}\n      <!-- TP_START -->${tpBody[2]}<!-- TP_END -->\n      ${tpBody[3]}` +
      out.slice(tpBody.index + tpBody[0].length);
  }
  return out;
}

function updateMastheadAndSection(html, todayDate, sectionLabel, financialSectionLabel) {
  const date = todayDate.trim();
  const label = sectionLabel.trim();
  const finLabel = (financialSectionLabel || `Recent financial news — ${date}`).trim();
  const escapedLabel = escapeHtml(label);
  const escapedFinLabel = escapeHtml(finLabel);
  let out = html.replace(
    /(<div class="masthead-date" id="today-date">)([\s\S]*?)(<\/div>)/,
    `$1${escapeHtml(date)}$3`,
  );
  if (/id="news-heading"/.test(out)) {
    out = out.replace(
      /(<span class="section-header-label" id="news-heading">)([\s\S]*?)(<\/span>)/,
      `$1${escapedLabel}$3`,
    );
  } else {
    out = out.replace(
      /(<span class="section-header-label"[^>]*>)([\s\S]*?(?:Today's|Recent) news[\s\S]*?)(<\/span>)/,
      `$1${escapedLabel}$3`,
    );
  }
  if (/id="fin-news-heading"/.test(out)) {
    out = out.replace(
      /(<span class="section-header-label" id="fin-news-heading">)([\s\S]*?)(<\/span>)/,
      `$1${escapedFinLabel}$3`,
    );
  }
  out = out.replace(
    /(<div class="masthead-updated">)([\s\S]*?)(<\/div>)/,
    `$1Last updated automatically — check sources for latest$3`,
  );
  return out;
}

/** Billing / quota errors must not be retried across tool variants. */
function isAnthropicBillingError(err) {
  const msg = err?.message || String(err || "");
  const nested =
    err?.error?.error?.message ||
    err?.error?.message ||
    (typeof err?.error === "string" ? err.error : "");
  const combined = `${msg}\n${nested}`;
  return /credit balance is too low|insufficient.?credit|billing|purchase credits|Plans & Billing|quota.?exceeded|rate.?limit.*billing/i.test(
    combined,
  );
}

function formatAnthropicBillingError(err) {
  const detail =
    err?.error?.error?.message ||
    err?.error?.message ||
    err?.message ||
    String(err);
  return (
    `Anthropic API billing/credit error — refill credits at https://console.anthropic.com/settings/billing then re-run.\n` +
    `Detail: ${detail}`
  );
}

/** Wall-clock bound for a single streaming request (SSE keeps the connection alive). */
const ANTHROPIC_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
/**
 * App-level retries after a timeout on the *same* tool variant.
 * Keep low so we fail over to the next variant (or no-tools) before the GHA job burns ~15m.
 * SDK maxRetries is 0 so these do not stack with SDK retries.
 */
const ANTHROPIC_TIMEOUT_RETRIES = 1;
const ANTHROPIC_TIMEOUT_RETRY_BASE_MS = 3000;

function isAnthropicTimeoutError(err) {
  if (!err) return false;
  if (
    err.name === "APIConnectionTimeoutError" ||
    err.constructor?.name === "APIConnectionTimeoutError"
  ) {
    return true;
  }
  const msg = err.message || String(err);
  return /APIConnectionTimeoutError|Request timed out|ETIMEDOUT|timeout/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rethrowBillingOr(err) {
  if (isAnthropicBillingError(err)) {
    throw err instanceof Error && /billing\/credit error/i.test(err.message)
      ? err
      : new Error(formatAnthropicBillingError(err));
  }
  throw err;
}

/**
 * Call Anthropic with timeout-only retries + exponential backoff.
 * Billing/credit errors fail immediately (no retry).
 */
async function withAnthropicTimeoutRetry(fn, label = "Anthropic request") {
  let lastErr;
  const maxAttempts = ANTHROPIC_TIMEOUT_RETRIES + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isAnthropicBillingError(err)) {
        rethrowBillingOr(err);
      }
      if (!isAnthropicTimeoutError(err) || attempt >= maxAttempts) {
        throw err;
      }
      lastErr = err;
      const delay = ANTHROPIC_TIMEOUT_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `${label} timed out (attempt ${attempt}/${maxAttempts}): ${err.message || err}. ` +
          `Retrying in ${delay}ms…`,
      );
      await sleep(delay);
    }
  }
  throw lastErr || new Error(`${label} failed after timeouts`);
}

/**
 * Prefer streaming: non-streaming web_search often sits idle with no bytes for
 * several minutes, and GitHub Actions / intermediate proxies close the TCP
 * connection around ~5 minutes (seen as APIConnectionTimeoutError). SSE events
 * keep the socket alive through multi-turn tool use.
 */
async function createMessage(client, params, label) {
  return withAnthropicTimeoutRetry(async () => {
    const stream = client.messages.stream(params);
    return stream.finalMessage();
  }, label);
}

async function requestDashboardJson(client, params) {
  let message;
  try {
    message = await createMessage(client, params, "Anthropic messages.create");
  } catch (err) {
    rethrowBillingOr(err);
  }
  const raw = extractText(message.content);
  const stopReason = message.stop_reason;
  if (stopReason && stopReason !== "end_turn" && stopReason !== "tool_use") {
    console.warn(`Anthropic stop_reason=${stopReason}`);
  }
  if (!raw.trim()) {
    throw new Error(
      `Model returned empty text content (stop_reason=${stopReason || "unknown"})`,
    );
  }

  try {
    return validatePayload(parseJsonResponse(raw));
  } catch (parseErr) {
    // Web search often spends tokens on narration and never emits JSON
    // (or hits max_tokens mid-thought). Continue once without tools.
    console.warn(
      `JSON parse failed (${parseErr.message.split("\n")[0]}). Requesting JSON-only continuation…`,
    );
    let continuation;
    try {
      continuation = await createMessage(
        client,
        {
          model: params.model,
          max_tokens: params.max_tokens,
          system: params.system,
          messages: [
            ...params.messages,
            { role: "assistant", content: message.content },
            {
              role: "user",
              content:
                "Your previous reply did not contain valid JSON (or was truncated). " +
                "Using the research you already gathered, respond with ONLY the raw JSON object. " +
                "No preamble, no markdown fences, no commentary — JSON only.",
            },
          ],
        },
        "Anthropic JSON continuation",
      );
    } catch (err) {
      rethrowBillingOr(err);
    }
    const contRaw = extractText(continuation.content);
    if (!contRaw.trim()) {
      throw new Error(
        `Continuation returned empty text (stop_reason=${continuation.stop_reason || "unknown"})`,
      );
    }
    return validatePayload(parseJsonResponse(contRaw));
  }
}

async function fetchDashboardData(apiKey) {
  // Streaming + generous timeout: scheduled runs (Aug 4 #30918362133, Aug 5
  // #31014010755) hit APIConnectionTimeoutError ~5m into non-streaming
  // web_search — idle sockets get closed before the full JSON arrives.
  // Disable SDK retries so app-level timeout retries do not stack into hours.
  const client = new Anthropic({
    apiKey,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: 0,
  });
  const model = "claude-sonnet-4-6";
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const userPrompt = `Today's date is ${today}.

Return 3–5 newsItems (accountability/care/CMS/lawsuit/congressional oversight — newest first),
3–5 financialNewsItems (earnings/revenue/margins/guidance/buybacks/stock only — newest first),
and 5–7 talkingPoints.
For talkingPoints[].text, start with a short punchy title sentence ending in a period, then the supporting sentences.
When a talking point cites a specific earnings release, court ruling, monitor report, CON decision, congressional testimony (e.g. Sam Hazen Ways and Means), or news article, include source (short name) and sourceUrl with the real URL; omit both if unknown. Preserve url/sourceUrl whenever known.
For each newsItems[] / financialNewsItems[] entry:
- include url with the real article/press-release/filing/hearing URL when known; omit url if unknown. Never invent URLs.
- include brief (2–4 sentences) for the on-page news-brief modal.
- REQUIRED: accountabilityPoints — 2–4 short Reclaim positioning / talking-point bullets shown under each card blurb and in the click-modal. Write them for advocates (how to frame the story to hold HCA accountable). For financialNewsItems, connect earnings/revenue/cost-cutting/margins/guidance/buybacks/stock to Mission accountability (profits vs staffing, capital returns vs missing staffing plans, IR silence on CMS/AG).
Consider Sam Hazen / House Ways and Means testimony (April 28, 2026) when relevant for newsItems or talkingPoints; paraphrase carefully, do not invent quotes.
For tag, use a short label like Lawsuit, Noncompliance, Earnings, CON, Safety, Monitor, Congress, Guidance, Margins, Buyback, or Update. Prefer "Lawsuit" (not "Trial") for AG case items.
For tagClass, choose tag-red, tag-amber, tag-blue, or tag-teal to match severity/topic.
Set todayDate to today's date in "Month D, YYYY" format.
Set sectionLabel to "Recent news — Month D, YYYY" using that same date.
Set financialSectionLabel to "Recent financial news — Month D, YYYY" using that same date.

CRITICAL: After any tool use, your FINAL message must be ONLY the raw JSON object — no narration like "Now I have…" or "Let me compile…".`;

  const baseParams = {
    model,
    // Web search burns output budget on tool rounds; leave headroom for full JSON.
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  };

  // Prefer Anthropic web search when available; fall back without tools.
  const toolVariants = [
    [{ type: "web_search_20260209", name: "web_search" }],
    [{ type: "web_search_20250305", name: "web_search" }],
    null,
  ];

  let lastError;
  for (const tools of toolVariants) {
    try {
      const params = tools ? { ...baseParams, tools } : baseParams;
      console.log(
        tools
          ? `Calling Anthropic (${model}) via stream with ${tools[0].type}…`
          : `Calling Anthropic (${model}) via stream without web search tools…`,
      );
      return await requestDashboardJson(client, params);
    } catch (err) {
      lastError = err;
      // Billing/quota: fail immediately. Do not retry other tool variants —
      // a prior broad status===400 / /400/ match treated credit errors as
      // "tool rejected" and burned extra failed API calls.
      if (isAnthropicBillingError(err)) {
        throw err instanceof Error && /billing\/credit error/i.test(err.message)
          ? err
          : new Error(formatAnthropicBillingError(err));
      }
      const msg = err?.message || String(err);
      // Timeouts on a web_search variant: fail over (older tool type, then no tools)
      // instead of failing the whole job after stacking retries on one path.
      if (tools && isAnthropicTimeoutError(err)) {
        console.warn(
          `Timed out with ${tools[0].type} (${msg.split("\n")[0]}). Trying next option…`,
        );
        continue;
      }
      const toolRejected =
        tools &&
        (/web_search|tool|tools|invalid|unknown|not.?support|404/i.test(msg) ||
          err?.status === 404 ||
          // 400 is often "unknown tool type" — but exclude billing (handled above)
          (err?.status === 400 && /tool|tools|web_search/i.test(msg)));
      // JSON/validation failures are not tool-rejection — but if web search
      // returned unusable narration, try the next variant (incl. no tools).
      const parseOrEmpty =
        /Failed to parse model JSON|empty text|Continuation returned empty/i.test(
          msg,
        );
      if (toolRejected || (tools && parseOrEmpty)) {
        console.warn(
          tools
            ? `Web search path failed (${msg.split("\n")[0]}). Trying next option…`
            : msg,
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Anthropic request failed");
}

async function main() {
  const apiKey = requireApiKey();
  const htmlPath = resolveHtmlPath();

  if (!fs.existsSync(htmlPath)) {
    console.error(`Error: dashboard HTML not found at ${htmlPath}`);
    process.exit(1);
  }

  console.log(`Dashboard: ${htmlPath}`);

  const data = await fetchDashboardData(apiKey);
  data.newsItems = sortNewsItemsByDateDesc(data.newsItems);
  data.financialNewsItems = sortNewsItemsByDateDesc(data.financialNewsItems);

  let html = fs.readFileSync(htmlPath, "utf8");
  html = ensureMarkers(html);
  html = replaceBetween(
    html,
    "<!-- NEWS_START -->",
    "<!-- NEWS_END -->",
    renderNewsItems(data.newsItems),
  );
  if (data.financialNewsItems.length > 0) {
    html = replaceBetween(
      html,
      "<!-- FIN_NEWS_START -->",
      "<!-- FIN_NEWS_END -->",
      renderNewsItems(data.financialNewsItems),
    );
  }
  html = replaceBetween(
    html,
    "<!-- TP_START -->",
    "<!-- TP_END -->",
    renderTalkingPoints(data.talkingPoints),
  );
  html = updateMastheadAndSection(
    html,
    data.todayDate,
    data.sectionLabel,
    data.financialSectionLabel,
  );

  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Dashboard updated successfully");
  console.log(
    `  newsItems=${data.newsItems.length} financialNewsItems=${data.financialNewsItems.length} talkingPoints=${data.talkingPoints.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
