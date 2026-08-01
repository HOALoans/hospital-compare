#!/usr/bin/env node
/**
 * Refresh HCA Watchdog dashboard news + talking points via Anthropic.
 * Usage (from repo root): npm run update:hca-watchdog
 * Or: node scripts/update-dashboard.js
 *
 * Requires ANTHROPIC_API_KEY. Optional: DASHBOARD_HTML (default public/hca-watchdog/index.html)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SYSTEM_PROMPT =
  "You are a research assistant for Reclaim Healthcare WNC, a nonprofit holding HCA accountable for poor care at Mission Hospital in Asheville NC. Search for the latest news about HCA Healthcare, Mission Hospital Asheville, NC Attorney General lawsuit against HCA, CMS compliance status, and HCA earnings. Return ONLY a valid JSON object with these fields: { todayDate: string, newsItems: [{source, date, tag, headline, blurb}], talkingPoints: [{text}], arcUpdate: string }. No markdown, no preamble, just raw JSON.";

const USER_PROMPT = `Today's date is ${new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
})}.

Use web search to find the most recent, credible news on:
- HCA Healthcare / Mission Hospital Asheville
- NC Attorney General lawsuit against HCA
- CMS compliance / Immediate Jeopardy / federal monitor at Mission
- HCA earnings or investor communications mentioning Mission or WNC

Return 4–6 newsItems (newest first) and 5–6 talkingPoints.
For talkingPoints[].text, start with a short punchy title sentence ending in a period, then the supporting sentences.
For tag, use a short label like Trial, Noncompliance, Earnings, CON, Lawsuit, Safety, Monitor, or Update.
Set todayDate to today's date in "Month D, YYYY" format.
arcUpdate should be one paragraph on what comes next for accountability.

Respond with raw JSON only.`;

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
  // Strip markdown fences if the model wraps JSON
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

function tagClass(tag) {
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

function formatTalkingPointText(text) {
  const cleaned = String(text).trim();
  // **Title** rest
  const md = cleaned.match(/^\*\*(.+?)\*\*\s*(.*)$/s);
  if (md) {
    return `<strong>${escapeHtml(md[1])}</strong> ${escapeHtml(md[2]).trim()}`;
  }
  // Title. Rest — bold first sentence when short
  const m = cleaned.match(/^(.+?[.!?])\s+(.+)$/s);
  if (m && m[1].length <= 90) {
    return `<strong>${escapeHtml(m[1])}</strong> ${escapeHtml(m[2])}`;
  }
  return escapeHtml(cleaned);
}

function renderNewsItems(items) {
  return items
    .map(
      (item) => `      <article class="news-item">
        <div class="news-meta">
          <span class="news-source">${escapeHtml(item.source)}</span>
          <span class="news-date">${escapeHtml(item.date)}</span>
          <span class="tag ${tagClass(item.tag)}">${escapeHtml(item.tag)}</span>
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

function updateMastheadDate(html, todayDate) {
  const date = todayDate || new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  let out = html.replace(
    /(<div class="masthead-date" id="today-date">)([\s\S]*?)(<\/div>)/,
    `$1${escapeHtml(date)}$3`,
  );
  out = out.replace(
    /(<span class="section-header-label" id="news-heading">)([\s\S]*?)(<\/span>)/,
    `$1Today's news — ${escapeHtml(date)}$3`,
  );
  out = out.replace(
    /(<div class="masthead-updated">)([\s\S]*?)(<\/div>)/,
    `$1Last updated automatically — check sources for latest$3`,
  );
  return out;
}

async function fetchDashboardData(apiKey) {
  const client = new Anthropic({ apiKey });
  const model = "claude-sonnet-4-6";
  const baseParams = {
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: USER_PROMPT }],
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

  let data;
  try {
    data = await fetchDashboardData(apiKey);
  } catch (err) {
    const status = err?.status ? ` (HTTP ${err.status})` : "";
    console.error(`Anthropic API error${status}: ${err?.message || err}`);
    if (err?.error) {
      console.error(JSON.stringify(err.error, null, 2));
    }
    process.exit(1);
  }

  let html = fs.readFileSync(htmlPath, "utf8");
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
  html = updateMastheadDate(html, data.todayDate);

  fs.writeFileSync(htmlPath, html, "utf8");
  console.log(
    `Updated ${data.newsItems.length} news items and ${data.talkingPoints.length} talking points.`,
  );
  if (data.arcUpdate) {
    console.log(`\narcUpdate (not written to HTML):\n${data.arcUpdate}`);
  }
  console.log(`Wrote ${htmlPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
