#!/usr/bin/env node
/**
 * Sync HCA dashboard article sources into the daily "universe" registry.
 *
 * Run after manually adding news cards to public/hca/index.html:
 *   npm run sync:hca-sources
 *
 * The weekday update:hca job also syncs automatically before/after refresh.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { syncSourcesFromHtml, HCA_SOURCES_PATH } from "./hcaSources.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function resolveHtmlPath() {
  const override = process.env.DASHBOARD_HTML;
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(ROOT, override);
  }
  return path.join(ROOT, "public", "hca", "index.html");
}

const htmlPath = resolveHtmlPath();
if (!fs.existsSync(htmlPath)) {
  console.error(`Dashboard HTML not found: ${htmlPath}`);
  process.exit(1);
}

const result = syncSourcesFromHtml(htmlPath);
console.log(`Synced HCA sources → ${HCA_SOURCES_PATH}`);
console.log(`  total outlets: ${result.total}`);
if (result.added.length) {
  console.log(`  newly added:`);
  for (const s of result.added) {
    console.log(`    - ${s.name}${s.host ? ` (${s.host})` : ""}`);
  }
} else {
  console.log("  no new outlets (registry already up to date)");
}
