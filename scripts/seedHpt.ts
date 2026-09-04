/**
 * Regenerate server/hpt/seedData.json for key WNC hospitals.
 * Run: npm run seed:hpt
 *
 * Ships with the app so Pricing loads Mission/Pardee instantly.
 */
import fs from "fs";
import path from "path";
import { DEFAULT_HCPCS_CODES } from "../shared/hpt.js";
import type { HospitalSummary } from "../shared/types.js";
import { discoverMrfUrl } from "../server/hpt/discover.js";
import { parseMrfUrl } from "../server/hpt/parseMrf.js";

const HOSPITALS: HospitalSummary[] = [
  {
    facilityId: "340002",
    name: "MEMORIAL MISSION HOSPITAL AND ASHEVILLE SURGERY CE",
    city: "ASHEVILLE",
    state: "NC",
    zip: "28801",
    zip3: "288",
    county: "BUNCOMBE",
    ownership: "Proprietary",
    ownershipGroup: "for-profit",
    hospitalType: "Acute Care Hospitals",
    overallRating: "3",
    latitude: null,
    longitude: null,
  },
  {
    facilityId: "340017",
    name: "PARDEE HOSPITAL HENDERSON COUNTY",
    city: "HENDERSONVILLE",
    state: "NC",
    zip: "28791",
    zip3: "287",
    county: "HENDERSON",
    ownership: "Government - Local",
    ownershipGroup: "government",
    hospitalType: "Acute Care Hospitals",
    overallRating: "5",
    latitude: null,
    longitude: null,
  },
];

async function main() {
  const filter = new Set(DEFAULT_HCPCS_CODES);
  const date = new Date().toISOString().slice(0, 10);
  const out = {
    version: 1,
    seededAt: new Date().toISOString(),
    date,
    hospitals: [] as Array<{
      facilityId: string;
      name: string;
      zip3: string;
      mrfUrl: string;
      via: string;
      codes: Record<string, unknown>;
    }>,
  };

  for (const h of HOSPITALS) {
    console.log(`[seed] ${h.facilityId} ${h.name}`);
    const found = await discoverMrfUrl(h);
    if (!found) throw new Error(`No MRF for ${h.facilityId}`);
    const t0 = Date.now();
    const parsed = await parseMrfUrl(found.mrfUrl, { codeFilter: filter });
    console.log(`[seed] ${h.facilityId}: ${Object.keys(parsed.codes).length} codes in ${Date.now() - t0}ms`);
    out.hospitals.push({
      facilityId: h.facilityId,
      name: h.name,
      zip3: h.zip3,
      mrfUrl: found.mrfUrl,
      via: found.via,
      codes: parsed.codes,
    });
  }

  const dest = path.join(process.cwd(), "server/hpt/seedData.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 0));
  console.log(`[seed] Wrote ${dest} (${fs.statSync(dest).size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
