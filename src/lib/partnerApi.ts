import type { PartnerBranding } from "@shared/partnerConfig";
import { DEFAULT_PARTNER } from "@shared/partnerConfig";

export async function fetchPartnerBranding(id: string): Promise<PartnerBranding> {
  const res = await fetch(`/api/partners/${encodeURIComponent(id)}`);
  if (res.status === 404) return DEFAULT_PARTNER;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load partner (${res.status})`);
  }
  return (await res.json()) as PartnerBranding;
}
