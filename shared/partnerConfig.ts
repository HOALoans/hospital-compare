import { SITE_NAME } from "./measures.js";

export type PartnerBranding = {
  id: string;
  displayName: string;
  logoUrl: string | null;
  logoAlt?: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeHeadline: string;
  welcomeSubheadline?: string;
  heroDescription?: string;
  tagline?: string;
  showPoweredBy?: boolean;
  /**
   * When true, the branded experience is hidden behind an access-code gate so it
   * can be shared as a private partner preview / demo rather than a public page.
   */
  gated?: boolean;
};

/** Built-in Parigrado branding — always served from code, never stored in JSON. */
export const DEFAULT_PARTNER: PartnerBranding = {
  id: "default",
  displayName: SITE_NAME,
  logoUrl: null,
  primaryColor: "#4f46e5",
  secondaryColor: "#ea580c",
  welcomeHeadline: "Know how your hospital really compares",
  showPoweredBy: false,
};

/** Seed partners migrated to data/partners.json on first server run. */
export const SEED_PARTNERS: Record<string, PartnerBranding> = {
  acme: {
    id: "acme",
    displayName: "ACME Health",
    logoUrl: null,
    primaryColor: "#0d9488",
    secondaryColor: "#0369a1",
    welcomeHeadline: "Find Top-Rated Hospitals in Your Network",
    welcomeSubheadline:
      "Compare quality scores for hospitals covered by your ACME Health plan.",
    heroDescription:
      "Parigrado is a plug-and-play transparency widget that helps self-insured employers satisfy CAA fiduciary mandates, drive employees to high-value care, and lower annual plan expenditures—fully branded to your corporate identity.",
    showPoweredBy: true,
  },
  // Partnership CONCEPT preview for AARP — not an official AARP product.
  // Uses a typographic "AARP" wordmark placeholder; a production build would
  // swap in licensed brand assets provided by AARP under a co-brand agreement.
  aarp: {
    id: "aarp",
    displayName: "AARP",
    logoUrl: "/aarp-wordmark.svg",
    logoAlt: "AARP (partnership concept — not an official AARP product)",
    primaryColor: "#EC1300",
    secondaryColor: "#26374A",
    welcomeHeadline: "Choose the right hospital with confidence",
    welcomeSubheadline:
      "Compare any hospital's quality, safety, and patient-experience scores against local, state, and national peers — using the same public federal data, never paid rankings.",
    heroDescription:
      "A member-first hospital quality guide for the 50+ community. Parigrado turns the government's own CMS and CDC data into a clear, side-by-side comparison so members and their families can make informed care decisions — with no advertising, sponsorships, or pay-to-rank lists influencing what they see.",
    tagline: "Hospital quality for members 50+",
    showPoweredBy: true,
    gated: true,
  },
};

export function slugifyPartnerId(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "partner"
  );
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
