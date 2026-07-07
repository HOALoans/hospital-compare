import type { PartnerBranding } from "@shared/partnerConfig";

const STORAGE_KEY = "parigrado_admin_key";

export function getStoredAdminKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearStoredAdminKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

async function adminFetch<T>(
  path: string,
  init: RequestInit & { adminKey: string },
): Promise<T> {
  const { adminKey, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${adminKey}`);
  const res = await fetch(path, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function listPartners(adminKey: string) {
  return adminFetch<{ partners: PartnerBranding[] }>("/api/admin/partners", {
    adminKey,
  });
}

export function createPartnerApi(adminKey: string, data: Record<string, unknown>) {
  return adminFetch<PartnerBranding>("/api/admin/partners", {
    method: "POST",
    adminKey,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updatePartnerApi(
  adminKey: string,
  id: string,
  data: Record<string, unknown>,
) {
  return adminFetch<PartnerBranding>(`/api/admin/partners/${encodeURIComponent(id)}`, {
    method: "PUT",
    adminKey,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deletePartnerApi(adminKey: string, id: string) {
  return adminFetch<{ ok: boolean }>(`/api/admin/partners/${encodeURIComponent(id)}`, {
    method: "DELETE",
    adminKey,
  });
}

export async function uploadPartnerLogo(
  adminKey: string,
  id: string,
  file: File,
): Promise<PartnerBranding> {
  const form = new FormData();
  form.append("logo", file);
  const res = await fetch(`/api/admin/partners/${encodeURIComponent(id)}/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminKey}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }
  return body as PartnerBranding;
}

export async function verifyAdminKey(key: string): Promise<boolean> {
  try {
    await listPartners(key);
    return true;
  } catch {
    return false;
  }
}
