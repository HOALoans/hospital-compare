#!/usr/bin/env node
/**
 * Morning email digest of recent HCA dashboard headlines (advocacy + financial).
 *
 * Reads public/hca/index.html, includes items dated "today" or "yesterday"
 * in America/New_York (pragmatic ~24–48h window for date-only strings).
 * Skips send when there are no matching headlines.
 *
 * Requires GitHub Actions secrets / env:
 *   RESEND_API_KEY  — Resend API key (https://resend.com)
 *   DIGEST_FROM     — verified From address, e.g. "HCA Dashboard <digest@yourdomain.com>"
 * Optional:
 *   DIGEST_TO       — override recipient (default LarryRkirschner@gmail.com)
 *   DASHBOARD_HTML  — path override
 *   DIGEST_DRY_RUN  — if "1", print email and exit without sending
 *
 * Usage: node scripts/send-morning-digest.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_URL = "https://parigrado.com/hca/";
const DEFAULT_TO = "LarryRkirschner@gmail.com";

function resolveHtmlPath() {
  const override = process.env.DASHBOARD_HTML;
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(ROOT, override);
  }
  return path.join(ROOT, "public", "hca", "index.html");
}

/** Parse news dates like "July 28, 2026", "July 2026", or ISO. Unparseable → null. */
function parseNewsDate(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const t = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(t) ? null : t;
  }

  const monthDayYear = raw.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})$/i,
  );
  if (monthDayYear) {
    const t = Date.parse(
      `${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]} UTC`,
    );
    return Number.isNaN(t) ? null : t;
  }

  // Month-only dates are too coarse for a 24h digest — exclude
  const monthYear = raw.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
  );
  if (monthYear) return null;

  const fallback = Date.parse(raw);
  return Number.isNaN(fallback) ? null : fallback;
}

/** Calendar YYYY-MM-DD in America/New_York for a given Date. */
function nyYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

function extractSection(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return "";
  return html.slice(start + startMarker.length, end);
}

function parseNewsItems(sectionHtml, category) {
  const items = [];
  const articleRe = /<article\s+class="news-item"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = articleRe.exec(sectionHtml)) !== null) {
    const block = match[1];
    const dateMatch = block.match(
      /<span\s+class="news-date"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const sourceMatch = block.match(
      /<(?:a|span)[^>]*class="[^"]*news-source[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/i,
    );
    const headlineLink = block.match(
      /<h2\s+class="news-headline"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const headlinePlain = block.match(
      /<h2\s+class="news-headline"[^>]*>([\s\S]*?)<\/h2>/i,
    );

    const date = dateMatch ? stripTags(dateMatch[1]) : "";
    const source = sourceMatch ? stripTags(sourceMatch[1]) : "";
    let headline = "";
    let url = "";
    if (headlineLink) {
      url = decodeHtmlEntities(headlineLink[1]).trim();
      headline = stripTags(headlineLink[2]);
    } else if (headlinePlain) {
      headline = stripTags(headlinePlain[1]);
    }

    if (!headline) continue;
    items.push({ category, source, date, headline, url });
  }
  return items;
}

function isInDigestWindow(item, todayYmd, yesterdayYmd) {
  const t = parseNewsDate(item.date);
  if (t == null) return false;
  const itemYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
  return itemYmd === todayYmd || itemYmd === yesterdayYmd;
}

function formatPlain(items, todayYmd) {
  const lines = [
    `HCA / Mission morning digest — ${todayYmd}`,
    "",
    "Dashboard: " + SITE_URL,
    "",
  ];
  const advocacy = items.filter((i) => i.category === "advocacy");
  const financial = items.filter((i) => i.category === "financial");

  if (advocacy.length) {
    lines.push("Advocacy / accountability");
    lines.push("-------------------------");
    for (const item of advocacy) {
      lines.push(`• ${item.headline}`);
      lines.push(`  ${item.source || "Source"} — ${item.date}`);
      if (item.url) lines.push(`  ${item.url}`);
      lines.push("");
    }
  }
  if (financial.length) {
    lines.push("Financial");
    lines.push("---------");
    for (const item of financial) {
      lines.push(`• ${item.headline}`);
      lines.push(`  ${item.source || "Source"} — ${item.date}`);
      if (item.url) lines.push(`  ${item.url}`);
      lines.push("");
    }
  }
  lines.push("Full dashboard: " + SITE_URL);
  return lines.join("\n");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatHtml(items, todayYmd) {
  const renderList = (list) =>
    list
      .map((item) => {
        const title = item.url
          ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.headline)}</a>`
          : escapeHtml(item.headline);
        return `<li style="margin-bottom:12px"><strong>${title}</strong><br><span style="color:#555">${escapeHtml(item.source || "Source")} — ${escapeHtml(item.date)}</span></li>`;
      })
      .join("\n");

  const advocacy = items.filter((i) => i.category === "advocacy");
  const financial = items.filter((i) => i.category === "financial");

  let body = `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.45">Headlines from the HCA / Mission dashboard dated today or yesterday (Eastern). <a href="${SITE_URL}">Open the dashboard →</a></p>`;

  if (advocacy.length) {
    body += `<h2 style="font-family:system-ui,sans-serif;font-size:16px">Advocacy / accountability</h2><ul style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.4;padding-left:20px">${renderList(advocacy)}</ul>`;
  }
  if (financial.length) {
    body += `<h2 style="font-family:system-ui,sans-serif;font-size:16px">Financial</h2><ul style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.4;padding-left:20px">${renderList(financial)}</ul>`;
  }

  body += `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#555"><a href="${SITE_URL}">${SITE_URL}</a></p>`;
  return `<!DOCTYPE html><html><body><h1 style="font-family:system-ui,sans-serif;font-size:18px">HCA / Mission morning digest — ${escapeHtml(todayYmd)}</h1>${body}</body></html>`;
}

async function sendViaResend({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it as a GitHub Actions secret (Resend free tier).",
    );
  }
  if (!from || !from.trim()) {
    throw new Error(
      'DIGEST_FROM is not set. Example: "HCA Dashboard <digest@yourdomain.com>" (domain must be verified in Resend).',
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from.trim(),
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const bodyText = await res.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = { raw: bodyText };
  }
  if (!res.ok) {
    throw new Error(
      `Resend API error ${res.status}: ${typeof data === "object" ? JSON.stringify(data) : bodyText}`,
    );
  }
  return data;
}

async function main() {
  const htmlPath = resolveHtmlPath();
  if (!fs.existsSync(htmlPath)) {
    console.error(`Dashboard HTML not found: ${htmlPath}`);
    process.exit(1);
  }

  const dryRun = process.env.DIGEST_DRY_RUN === "1";
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.DIGEST_FROM || "").trim();

  if (!dryRun && (!apiKey || !from)) {
    console.log(
      "Morning digest skipped: set RESEND_API_KEY and DIGEST_FROM GitHub secrets to enable (see public/hca/README.md).",
    );
    return;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const advocacyHtml = extractSection(html, "<!-- NEWS_START -->", "<!-- NEWS_END -->");
  const financialHtml = extractSection(
    html,
    "<!-- FIN_NEWS_START -->",
    "<!-- FIN_NEWS_END -->",
  );

  const all = [
    ...parseNewsItems(advocacyHtml, "advocacy"),
    ...parseNewsItems(financialHtml, "financial"),
  ];

  const todayYmd = nyYmd(new Date());
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const yDate = new Date(Date.UTC(ty, tm - 1, td));
  yDate.setUTCDate(yDate.getUTCDate() - 1);
  const yesterdayYmd = `${yDate.getUTCFullYear()}-${String(yDate.getUTCMonth() + 1).padStart(2, "0")}-${String(yDate.getUTCDate()).padStart(2, "0")}`;

  const recent = all.filter((item) =>
    isInDigestWindow(item, todayYmd, yesterdayYmd),
  );

  console.log(
    `Parsed ${all.length} headlines; ${recent.length} in window (${yesterdayYmd} / ${todayYmd} America/New_York calendar).`,
  );

  if (recent.length === 0) {
    console.log(
      "No new headlines in the last ~24–48 hours — skipping email send.",
    );
    return;
  }

  const to = (process.env.DIGEST_TO || DEFAULT_TO).trim() || DEFAULT_TO;
  const subject = `HCA / Mission digest — ${recent.length} headline${recent.length === 1 ? "" : "s"} (${todayYmd})`;
  const text = formatPlain(recent, todayYmd);
  const htmlBody = formatHtml(recent, todayYmd);

  if (dryRun) {
    console.log("--- DRY RUN ---");
    console.log(`To: ${to}`);
    console.log(`From: ${from || "(unset)"}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    return;
  }

  const result = await sendViaResend({
    from,
    to,
    subject,
    text,
    html: htmlBody,
  });
  console.log(`Digest sent to ${to}. Resend id: ${result?.id || "(unknown)"}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
