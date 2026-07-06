export type OwnershipGroup = "for-profit" | "non-profit" | "government" | "other";

export function classifyOwnership(ownership: string): OwnershipGroup {
  const o = ownership.toLowerCase();
  if (o.includes("proprietary")) return "for-profit";
  if (o.includes("non-profit") || o.includes("nonprofit")) return "non-profit";
  if (o.includes("government")) return "government";
  return "other";
}

export const OWNERSHIP_LABELS: Record<OwnershipGroup, string> = {
  "for-profit": "For-profit",
  "non-profit": "Non-profit",
  government: "Government",
  other: "Other",
};
