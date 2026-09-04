import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { upsertHospitalCharges, hospitalHasSnapshot, loadStatus } from "./store.js";

interface SeedHospital {
  facilityId: string;
  name: string;
  zip3: string;
  mrfUrl: string;
  via?: string;
  codes: Record<
    string,
    {
      description: string | null;
      cash: number | null;
      allMean: number | null;
      allMedian: number | null;
      allN: number;
    }
  >;
}

interface SeedFile {
  version: number;
  seededAt: string;
  date: string;
  hospitals: SeedHospital[];
}

function seedPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "seedData.json"),
    path.join(process.cwd(), "server/hpt/seedData.json"),
    path.join(process.cwd(), "dist/server/hpt/seedData.json"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]!;
}

/**
 * Load committed MRF extracts for key hospitals (Mission, Pardee, …) so the
 * Pricing page is instant instead of waiting on 100–800MB CMS downloads.
 * Does not overwrite a newer live crawl for the same snapshot date.
 */
export async function loadHptSeed(): Promise<void> {
  const file = seedPath();
  if (!fs.existsSync(file)) {
    console.log("[hpt] No seedData.json found — on-demand crawls only");
    return;
  }
  let seed: SeedFile;
  try {
    seed = JSON.parse(fs.readFileSync(file, "utf8")) as SeedFile;
  } catch (err) {
    console.warn("[hpt] Could not parse seedData.json:", err);
    return;
  }
  if (!seed.hospitals?.length) return;

  let loaded = 0;
  for (const h of seed.hospitals) {
    if (hospitalHasSnapshot(h.facilityId)) {
      const rec = loadStatus().hospitals[h.facilityId];
      // Keep live crawls; only fill gaps.
      if (rec?.lastOkAt && rec.lastOkAt.slice(0, 10) >= seed.date) continue;
    }
    await upsertHospitalCharges({
      facilityId: h.facilityId,
      zip3: h.zip3,
      date: seed.date,
      mrfUrl: h.mrfUrl,
      codes: h.codes,
    });
    const st = loadStatus();
    const rec = st.hospitals[h.facilityId];
    if (rec) {
      rec.name = h.name;
      // mark via seed in meta without breaking schema
      rec.error = undefined;
    }
    loaded += 1;
  }
  console.log(
    `[hpt] Seeded ${loaded}/${seed.hospitals.length} hospitals from seedData.json (${seed.date}, ${seed.seededAt})`,
  );
}
