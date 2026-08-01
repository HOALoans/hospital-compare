#!/usr/bin/env node
/**
 * Refresh HCA Watchdog dashboard news + talking points via Anthropic.
 * Usage (from repo root): npm run update:hca-watchdog
 * Or: node scripts/update-dashboard.js
 *
 * Live URL: https://parigrado.com/hca-watchdog/
 * HTML path: public/hca-watchdog/index.html
 * Hosted via Parigrado/Render (not GitHub Pages).
 * Workflow: .github/workflows/update-dashboard.yml
 *
 * Requires ANTHROPIC_API_KEY. Optional: DASHBOARD_HTML (default public/hca-watchdog/index.html)
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
- NC Attorney General Jeff Jackson sued HCA for violating acquisition commitments; a judge denied summary judgment on July 28, 2026, and the case proceeds to trial.
- Federal monitor (July 2026): Mission is not in substantial compliance; no staffing plans submitted.
- NC DHHS awarded Mission 95 CON beds despite active federal safety sanctions.`;

const SYSTEM_PROMPT = `You are a research assistant for Reclaim Healthcare WNC, a nonprofit holding HCA Healthcare accountable for poor care at Mission Hospital in Asheville NC. Your job is to generate updated content for their public watchdog dashboard.

Mission context: HCA acquired Mission in 2019, has received 4 Immediate Jeopardy citations, Mission has 2-star HCAHPS ratings 2020-2024, 800+ staff have left, staffing ratio fell from 6.1 to 3.7 FTE per bed vs 5.1 NC average. NC AG lawsuit proceeding to trial after July 28 2026 summary judgment denial. Federal monitor confirmed noncompliance July 2026.

${BACKGROUND_FACTS}

Generate updated dashboard content based on the most recent news you are aware of. Search for the latest news about HCA Healthcare, Mission Hospital Asheville, NC Attorney General lawsuit against HCA, CMS compliance status, and HCA earnings when tools are available.

Return ONLY a valid raw JSON object with exactly this structure, no markdown, no backticks, no preamble:
{
  todayDate: "Month D, YYYY",
  sectionLabel: "Today's news — Month D, YYYY",
  newsItems: [
    {
      source: "Source name",
      date: "Month D, YYYY",
      tag: "Tag text",
      tagClass: "tag-red or tag-amber or tag-blue or tag-teal",
      headline: "Headline text",
      blurb: "Two to three sentence summary with Reclaim framing"
    }
  ],
  talkingPoints: [
    { text: "Bold lead phrase. Rest of talking point." }
  ]
}`;

function resolveHtmlPath() {
  const override = process.env.DASHBOARD_HTML;
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(ROOT, override);
  }
  return path.join(ROOT, "public", "hca-watchdog", "index.html");
}

function requireApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set.\n" +
        "Export your key before running, e.g.:\n" +
        "  export ANTHROPIC_API_KEY=sk-ant-...\n" +
        "  npm run update:hca-watchdog",
    );
    process.exit(1);
  }
  return key.trim();
}

function extractText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function parseJsonResponse(raw) {
  let text = (raw || "").trim();
  // Strip markdown fences if the model wraps JSON anyway
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  // Fallback: first {...} object
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse model JSON: ${err.message}\n--- raw ---\n${raw.slice(0, 2000)}`,
    );
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
  for (const [i, item] of data.newsItems.entries()) {
    for (const key of ["source", "date", "tag", "headline", "blurb"]) {
      if (typeof item[key] !== "string" || !item[key].trim()) {
        throw new Error(`newsItems[${i}].${key} must be a non-empty string`);
      }
    }
  }
  for (const [i, tp] of data.talkingPoints.entries()) {
    if (typeof tp?.text !== "string" || !tp.text.trim()) {
      throw new Error(`talkingPoints[${i}].text must be a non-empty string`);
    }
  }
  return data;
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
  if (/earnings|revenue|profit|con|financial|investor|beds|award/.test(t)) {
    return "tag-amber";
  }
  if (/legal|court|ag|advocacy|media|press|politics|policy/.test(t)) {
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

function renderNewsItems(items) {
  return items
    .map(
      (item) => `      <article class="news-item">
        <div class="news-meta">
          <span class="news-source">${escapeHtml(item.source)}</span>
          <span class="news-date">${escapeHtml(item.date)}</span>
          <span class="tag ${resolveTagClass(item)}">${escapeHtml(item.tag)}</span>
        </div>
        <h2 class="news-headline">${escapeHtml(item.headline)}</h2>
        <p class="news-blurb">${escapeHtml(item.blurb)}</p>
      </article>`,
    )
    .join("\n");
}

function renderTalkingPoints(points) {
  return points
    .map(
      (tp, i) => `      <div class="tp-item">
        <div class="tp-num" aria-hidden="true">${i + 1}</div>
        <div class="tp-text">${formatTalkingPointText(tp.text)}</div>
      </div>`,
    )
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
      /(<span class="section-header-label"[^>]*>[\s\S]*?Today's news[\s\S]*?<\/span>\s*<\/div>\s*<div class="section-body">)([\s\S]*?)(<\/div>\s*<\/section>\s*<!-- TALKING POINTS -->)/i,
    );
    if (!newsBody) {
      throw new Error("Missing NEWS markers and could not locate news section to wrap");
    }
    out =
      out.slice(0, newsBody.index) +
      `${newsBody[1]}\n      <!-- NEWS_START -->${newsBody[2]}<!-- NEWS_END -->\n      ${newsBody[3]}` +
      out.slice(newsBody.index + newsBody[0].length);
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

function updateMastheadAndSection(html, todayDate, sectionLabel) {
  const date = todayDate.trim();
  const label = sectionLabel.trim();
  const escapedLabel = escapeHtml(label);
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
      /(<span class="section-header-label"[^>]*>)([\s\S]*?Today's news[\s\S]*?)(<\/span>)/,
      `$1${escapedLabel}$3`,
    );
  }
  out = out.replace(
    /(<div class="masthead-updated">)([\s\S]*?)(<\/div>)/,
    `$1Last updated automatically — check sources for latest$3`,
  );
  return out;
}

async function fetchDashboardData(apiKey) {
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-6";
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const userPrompt = `Today's date is ${today}.

Return 4–6 newsItems (newest first) and 5–6 talkingPoints.
For talkingPoints[].text, start with a short punchy title sentence ending in a period, then the supporting sentences.
For tag, use a short label like Trial, Noncompliance, Earnings, CON, Lawsuit, Safety, Monitor, or Update.
For tagClass, choose tag-red, tag-amber, tag-blue, or tag-teal to match severity/topic.
Set todayDate to today's date in "Month D, YYYY" format.
Set sectionLabel to "Today's news — Month D, YYYY" using that same date.

Respond with raw JSON only.`;

  const baseParams = {
    model,
    max_tokens: 4000,
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
          ? `Calling Anthropic (${model}) with ${tools[0].type}…`
          : `Calling Anthropic (${model}) without web search tools…`,
      );
      const message = await client.messages.create(params);
      const raw = extractText(message.content);
      if (!raw.trim()) {
        throw new Error("Model returned empty text content");
      }
      return validatePayload(parseJsonResponse(raw));
    } catch (err) {
      lastError = err;
      const msg = err?.message || String(err);
      const toolRejected =
        tools &&
        (/web_search|tool|tools|invalid|unknown|not.?support|400|404/i.test(msg) ||
          err?.status === 400 ||
          err?.status === 404);
      if (toolRejected) {
        console.warn(`Web search tool unavailable (${msg}). Trying next option…`);
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

  let html = fs.readFileSync(htmlPath, "utf8");
  html = ensureMarkers(html);
  html = replaceBetween(
    html,
    "<!-- NEWS_START -->",
    "<!-- NEWS_END -->",
    renderNewsItems(data.newsItems),
  );
  html = replaceBetween(
    html,
    "<!-- TP_START -->",
    "<!-- TP_END -->",
    renderTalkingPoints(data.talkingPoints),
  );
  html = updateMastheadAndSection(html, data.todayDate, data.sectionLabel);

  fs.writeFileSync(htmlPath, html, "utf8");
  console.log("Dashboard updated successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
