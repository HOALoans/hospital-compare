/**
 * Background nationwide hospital MRF crawl (separate from the web service).
 * Usage: INGEST_HPT=true npm run crawl:hpt
 */
process.env.INGEST_HPT = "true";

import { initializeCache } from "../server/cache.js";
import { startNationalHptCrawl } from "../server/hpt/crawl.js";

await initializeCache();
startNationalHptCrawl(() => true);
await new Promise(() => {
  /* Keep the process alive while the national MRF crawl runs. */
});
