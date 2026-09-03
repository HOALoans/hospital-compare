import { initializeCache } from "../server/cache.js";
import { startNationalHptCrawl } from "../server/hpt/crawl.js";

await initializeCache();
startNationalHptCrawl(() => true);
await new Promise(() => {
  /* Keep the process alive while the national MRF crawl runs. */
});
