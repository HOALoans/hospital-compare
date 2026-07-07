import type { PartnerBranding } from "@shared/partnerConfig";

const TOKEN_STORAGE_KEY = "parigrado_admin_key";
const EMAIL_STORAGE_KEY = "parigrado_admin_email";

export class AdminAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** @deprecated Use getStoredAdminToken */
export const getStoredAdminKey = getStoredAdminToken;

export function getStoredAdminEmail(): string | null {
  try {
    return sessionStorage.getItem(EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminSession(token: string, email: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  sessionStorage.setItem(EMAIL_STORAGE_KEY, email);
}

/** @deprecated Use setStoredAdminSession */
export function setStoredAdminKey(key: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, key);
}

export function clearStoredAdminSession(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(EMAIL_STORAGE_KEY);
}

/** @deprecated Use clearStoredAdminSession */
export const clearStoredAdminKey = clearStoredAdminSession;

async function adminFetch<T>(
  path: string,
  init: RequestInit & { adminToken: string },
): Promise<T> {
  const { adminToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${adminToken}`);
  const res = await fetch(path, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminAuthError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<{ token: string; email: string }> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminAuthError(res.status, body.error ?? "Sign in failed");
  }
  return body as { token: string; email: string };
}

export function listPartners(adminToken: string) {
  return adminFetch<{ partners: PartnerBranding[] }>("/api/admin/partners", {
    adminToken,
  });
}

export function createPartnerApi(adminToken: string, data: Record<string, unknown>) {
  return adminFetch<PartnerBranding>("/api/admin/partners", {
    method: "POST",
    adminToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updatePartnerApi(
  adminToken: string,
  id: string,
  data: Record<string, unknown>,
) {
  return adminFetch<PartnerBranding>(`/api/admin/partners/${encodeURIComponent(id)}`, {
    method: "PUT",
    adminToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deletePartnerApi(adminToken: string, id: string) {
  return adminFetch<{ ok: boolean }>(`/api/admin/partners/${encodeURIComponent(id)}`, {
    method: "DELETE",
    adminToken,
  });
}

export async function uploadPartnerLogo(
  adminToken: string,
  id: string,
  file: File,
): Promise<PartnerBranding> {
  const form = new FormData();
  form.append("logo", file);
  const res = await fetch(`/api/admin/partners/${encodeURIComponent(id)}/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminAuthError(res.status, body.error ?? `Upload failed (${res.status})`);
  }
  return body as PartnerBranding;
}
