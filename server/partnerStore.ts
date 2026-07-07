import fs from "fs";
import path from "path";
import {
  DEFAULT_PARTNER,
  SEED_PARTNERS,
  HEX_COLOR_RE,
  slugifyPartnerId,
  type PartnerBranding,
} from "../shared/partnerConfig.js";
import { LOGOS_DIR, PARTNERS_FILE } from "./dataPaths.js";

export { LOGOS_DIR } from "./dataPaths.js";

const RESERVED_IDS = new Set(["default"]);

let customPartners: Record<string, PartnerBranding> = {};

function ensureDataDirs(): void {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

function loadCustomPartners(): Record<string, PartnerBranding> {
  if (!fs.existsSync(PARTNERS_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(PARTNERS_FILE, "utf8")) as Record<
      string,
      PartnerBranding
    >;
    const out: Record<string, PartnerBranding> = {};
    for (const [id, partner] of Object.entries(raw)) {
      if (id === "default") continue;
      out[id] = { ...partner, id };
    }
    return out;
  } catch (err) {
    console.warn("[partners] Failed to read partners.json, starting fresh:", err);
    return {};
  }
}

function persistCustomPartners(): void {
  ensureDataDirs();
  fs.writeFileSync(PARTNERS_FILE, JSON.stringify(customPartners, null, 2), "utf8");
}

function seedIfEmpty(): void {
  if (Object.keys(customPartners).length > 0) return;
  customPartners = { ...SEED_PARTNERS };
  persistCustomPartners();
  console.log("[partners] Seeded initial partners (acme) to data/partners.json");
}

export function initPartnerStore(): void {
  ensureDataDirs();
  customPartners = loadCustomPartners();
  seedIfEmpty();
}

export function getPartner(id: string | null | undefined): PartnerBranding {
  if (!id || id === "default") return { ...DEFAULT_PARTNER };
  return customPartners[id] ? { ...customPartners[id] } : { ...DEFAULT_PARTNER };
}

export function getAllPartners(): PartnerBranding[] {
  return [{ ...DEFAULT_PARTNER }, ...Object.values(customPartners).map((p) => ({ ...p }))];
}

export function partnerExists(id: string): boolean {
  return id === "default" || id in customPartners;
}

export function isDefaultPartner(id: string): boolean {
  return id === "default";
}

export type PartnerInput = {
  id?: string;
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeHeadline: string;
  welcomeSubheadline?: string;
  heroDescription?: string;
  tagline?: string;
  showPoweredBy?: boolean;
  logoAlt?: string;
};

function validatePartnerInput(
  input: PartnerInput,
  opts: { existingId?: string },
): { ok: true; data: PartnerBranding } | { ok: false; error: string } {
  const displayName = input.displayName?.trim();
  if (!displayName) return { ok: false, error: "displayName is required" };

  const id = (input.id?.trim() || slugifyPartnerId(displayName)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return { ok: false, error: "id must be a lowercase slug (letters, numbers, hyphens)" };
  }
  if (RESERVED_IDS.has(id)) {
    return { ok: false, error: `id "${id}" is reserved` };
  }
  if (!opts.existingId && id in customPartners) {
    return { ok: false, error: `Partner id "${id}" already exists` };
  }
  if (!HEX_COLOR_RE.test(input.primaryColor)) {
    return { ok: false, error: "primaryColor must be a valid 6-digit hex color (#RRGGBB)" };
  }
  if (!HEX_COLOR_RE.test(input.secondaryColor)) {
    return { ok: false, error: "secondaryColor must be a valid 6-digit hex color (#RRGGBB)" };
  }

  const welcomeHeadline = input.welcomeHeadline?.trim();
  if (!welcomeHeadline) return { ok: false, error: "welcomeHeadline is required" };

  return {
    ok: true,
    data: {
      id,
      displayName,
      logoUrl: opts.existingId ? (customPartners[opts.existingId]?.logoUrl ?? null) : null,
      logoAlt: input.logoAlt?.trim() || displayName,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      welcomeHeadline,
      welcomeSubheadline: input.welcomeSubheadline?.trim() || undefined,
      heroDescription: input.heroDescription?.trim() || undefined,
      tagline: input.tagline?.trim() || undefined,
      showPoweredBy: Boolean(input.showPoweredBy),
    },
  };
}

export function createPartner(
  input: PartnerInput,
): { ok: true; partner: PartnerBranding } | { ok: false; error: string } {
  const validated = validatePartnerInput(input, {});
  if (!validated.ok) return validated;
  customPartners[validated.data.id] = validated.data;
  persistCustomPartners();
  return { ok: true, partner: { ...validated.data } };
}

export function updatePartner(
  id: string,
  input: PartnerInput,
): { ok: true; partner: PartnerBranding } | { ok: false; error: string; status?: number } {
  if (isDefaultPartner(id)) {
    return { ok: false, error: "The default Parigrado partner cannot be edited", status: 403 };
  }
  if (!(id in customPartners)) {
    return { ok: false, error: "Partner not found", status: 404 };
  }

  const requestedId = input.id?.trim().toLowerCase();
  if (requestedId && requestedId !== id) {
    return { ok: false, error: "Partner id cannot be changed after creation", status: 400 };
  }

  const validated = validatePartnerInput({ ...input, id }, { existingId: id });
  if (!validated.ok) return validated;

  const existing = customPartners[id];
  validated.data.logoUrl = existing.logoUrl;
  customPartners[id] = validated.data;
  persistCustomPartners();
  return { ok: true, partner: { ...validated.data } };
}

export function deletePartner(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  if (isDefaultPartner(id)) {
    return { ok: false, error: "The default partner cannot be deleted", status: 403 };
  }
  if (!(id in customPartners)) {
    return { ok: false, error: "Partner not found", status: 404 };
  }

  delete customPartners[id];
  persistCustomPartners();

  for (const file of fs.readdirSync(LOGOS_DIR)) {
    if (file.startsWith(`${id}.`)) {
      fs.unlinkSync(path.join(LOGOS_DIR, file));
    }
  }

  return { ok: true };
}

export function setPartnerLogo(
  id: string,
  filename: string,
): { ok: true; partner: PartnerBranding } | { ok: false; error: string; status?: number } {
  if (isDefaultPartner(id)) {
    return { ok: false, error: "Cannot upload a logo for the default partner", status: 403 };
  }
  if (!(id in customPartners)) {
    return { ok: false, error: "Partner not found", status: 404 };
  }

  const logoUrl = `/api/partner-logos/${filename}`;
  customPartners[id] = { ...customPartners[id], logoUrl };
  persistCustomPartners();
  return { ok: true, partner: { ...customPartners[id] } };
}

export function removeOldLogos(id: string, keepFilename?: string): void {
  if (!fs.existsSync(LOGOS_DIR)) return;
  for (const file of fs.readdirSync(LOGOS_DIR)) {
    if (file.startsWith(`${id}.`) && file !== keepFilename) {
      fs.unlinkSync(path.join(LOGOS_DIR, file));
    }
  }
}
