import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { PartnerBranding } from "@shared/partnerConfig";
import { HEX_COLOR_RE, slugifyPartnerId } from "@shared/partnerConfig";
import {
  clearStoredAdminKey,
  createPartnerApi,
  deletePartnerApi,
  getStoredAdminKey,
  listPartners,
  setStoredAdminKey,
  updatePartnerApi,
  uploadPartnerLogo,
  verifyAdminKey,
} from "@/lib/adminApi";

type FormState = {
  id: string;
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeHeadline: string;
  welcomeSubheadline: string;
  heroDescription: string;
  tagline: string;
  showPoweredBy: boolean;
};

const EMPTY_FORM: FormState = {
  id: "",
  displayName: "",
  primaryColor: "#4f46e5",
  secondaryColor: "#ea580c",
  welcomeHeadline: "",
  welcomeSubheadline: "",
  heroDescription: "",
  tagline: "",
  showPoweredBy: true,
};

function partnerToForm(partner: PartnerBranding): FormState {
  return {
    id: partner.id,
    displayName: partner.displayName,
    primaryColor: partner.primaryColor,
    secondaryColor: partner.secondaryColor,
    welcomeHeadline: partner.welcomeHeadline,
    welcomeSubheadline: partner.welcomeSubheadline ?? "",
    heroDescription: partner.heroDescription ?? "",
    tagline: partner.tagline ?? "",
    showPoweredBy: partner.showPoweredBy ?? false,
  };
}

function validateForm(form: FormState, existingIds: string[], editingId?: string): string | null {
  if (!form.displayName.trim()) return "Display name is required";
  const id = (form.id.trim() || slugifyPartnerId(form.displayName)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return "ID must be a lowercase slug (letters, numbers, hyphens)";
  }
  if (id === "default") return "The id \"default\" is reserved";
  if (!editingId && existingIds.includes(id)) return `Partner id "${id}" already exists`;
  if (!HEX_COLOR_RE.test(form.primaryColor)) return "Primary color must be #RRGGBB";
  if (!HEX_COLOR_RE.test(form.secondaryColor)) return "Secondary color must be #RRGGBB";
  if (!form.welcomeHeadline.trim()) return "Welcome headline is required";
  return null;
}

function formPayload(form: FormState) {
  return {
    id: form.id.trim() || slugifyPartnerId(form.displayName),
    displayName: form.displayName.trim(),
    primaryColor: form.primaryColor,
    secondaryColor: form.secondaryColor,
    welcomeHeadline: form.welcomeHeadline.trim(),
    welcomeSubheadline: form.welcomeSubheadline.trim() || undefined,
    heroDescription: form.heroDescription.trim() || undefined,
    tagline: form.tagline.trim() || undefined,
    showPoweredBy: form.showPoweredBy,
  };
}

interface Props {
  onExit: () => void;
}

export function PartnerAdminPage({ onExit }: Props) {
  const [adminKey, setAdminKey] = useState<string | null>(() => getStoredAdminKey());
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [partners, setPartners] = useState<PartnerBranding[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingIds = useMemo(
    () => partners.filter((p) => p.id !== "default").map((p) => p.id),
    [partners],
  );

  const selectedPartner = editingId ? partners.find((p) => p.id === editingId) : null;
  const shareUrl =
    editingId && editingId !== "default"
      ? `${window.location.origin}/?partner=${editingId}`
      : "";

  const flash = useCallback((type: "ok" | "err", text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  }, []);

  const loadPartners = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const data = await listPartners(key);
      setPartners(data.partners);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    if (adminKey) loadPartners(adminKey);
  }, [adminKey, loadPartners]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const ok = await verifyAdminKey(authInput);
    setAuthLoading(false);
    if (!ok) {
      setAuthError("Invalid admin key. Check ADMIN_SECRET on the server.");
      return;
    }
    setStoredAdminKey(authInput);
    setAdminKey(authInput);
    setAuthInput("");
  };

  const startCreate = () => {
    setMode("create");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
  };

  const startEdit = (partner: PartnerBranding) => {
    if (partner.id === "default") return;
    setMode("edit");
    setEditingId(partner.id);
    setForm(partnerToForm(partner));
    setLogoFile(null);
  };

  const cancelForm = () => {
    setMode("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey) return;
    const err = validateForm(form, existingIds, editingId ?? undefined);
    if (err) {
      flash("err", err);
      return;
    }
    setSaving(true);
    try {
      const payload = formPayload(form);
      let saved: PartnerBranding;
      if (mode === "create") {
        saved = await createPartnerApi(adminKey, payload);
        flash("ok", `Created partner "${saved.displayName}"`);
      } else if (editingId) {
        saved = await updatePartnerApi(adminKey, editingId, payload);
        flash("ok", `Updated partner "${saved.displayName}"`);
      } else {
        return;
      }

      if (logoFile) {
        saved = await uploadPartnerLogo(adminKey, saved.id, logoFile);
        flash("ok", "Logo uploaded");
      }

      await loadPartners(adminKey);
      setMode("edit");
      setEditingId(saved.id);
      setForm(partnerToForm(saved));
      setLogoFile(null);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async () => {
    if (!adminKey || !editingId || !logoFile) return;
    setSaving(true);
    try {
      const saved = await uploadPartnerLogo(adminKey, editingId, logoFile);
      flash("ok", "Logo uploaded");
      setLogoFile(null);
      setForm(partnerToForm(saved));
      await loadPartners(adminKey);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!adminKey || id === "default") return;
    if (!window.confirm(`Delete partner "${id}"? This cannot be undone.`)) return;
    try {
      await deletePartnerApi(adminKey, id);
      flash("ok", "Partner deleted");
      if (editingId === id) cancelForm();
      await loadPartners(adminKey);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Delete failed");
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (!adminKey) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="rounded-2xl border border-indigo-200 bg-white p-8 shadow-lg shadow-indigo-900/5">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl text-slate-900">Partner admin</h2>
          <p className="mt-2 text-sm text-slate-600">
            Enter the admin secret configured as <code className="text-indigo-700">ADMIN_SECRET</code>{" "}
            on the server. In local dev the default is <code className="text-indigo-700">dev-admin-key</code>.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="admin-key" className="block text-sm font-medium text-slate-700">
                Admin key
              </label>
              <input
                id="admin-key"
                type="password"
                value={authInput}
                onChange={(e) => setAuthInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                autoComplete="off"
                required
              />
            </div>
            {authError && (
              <p className="text-sm text-rose-600">{authError}</p>
            )}
            <button
              type="submit"
              disabled={authLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl text-slate-900">Partner programs</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Create white-label partner branding and share links like{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-indigo-700">
              ?partner=your-slug
            </code>
            . On Render, partner data and logos live on ephemeral disk unless a persistent volume is attached — they are lost on redeploy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to site
          </button>
          <button
            type="button"
            onClick={() => {
              clearStoredAdminKey();
              setAdminKey(null);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
          {mode === "list" && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              New partner
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {mode === "list" && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading partners…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Partner</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Colors</th>
                    <th className="px-4 py-3 font-medium">Share link</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {partners.map((partner) => {
                    const link = `${window.location.origin}/?partner=${partner.id}`;
                    const readOnly = partner.id === "default";
                    return (
                      <tr key={partner.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {partner.logoUrl ? (
                              <img
                                src={partner.logoUrl}
                                alt=""
                                className="h-8 max-w-[6rem] object-contain"
                              />
                            ) : (
                              <div
                                className="h-8 w-8 rounded-lg"
                                style={{ backgroundColor: partner.primaryColor }}
                              />
                            )}
                            <div>
                              <div className="font-medium text-slate-900">{partner.displayName}</div>
                              {readOnly && (
                                <span className="text-xs text-slate-400">Built-in (read-only)</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{partner.id}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <span
                              className="h-6 w-6 rounded border border-slate-200"
                              style={{ backgroundColor: partner.primaryColor }}
                              title={partner.primaryColor}
                            />
                            <span
                              className="h-6 w-6 rounded border border-slate-200"
                              style={{ backgroundColor: partner.secondaryColor }}
                              title={partner.secondaryColor}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {readOnly ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                            >
                              Preview
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {readOnly ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(partner)}
                                className="rounded-md p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(partner.id)}
                                className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {(mode === "create" || mode === "edit") && (
        <form onSubmit={handleSave} className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {mode === "create" ? "Create partner" : `Edit ${editingId}`}
              </h3>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Display name *</label>
                <input
                  value={form.displayName}
                  onChange={(e) => {
                    const displayName = e.target.value;
                    setForm((f) => ({
                      ...f,
                      displayName,
                      id: mode === "create" && !f.id ? slugifyPartnerId(displayName) : f.id,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">ID slug *</label>
                <input
                  value={form.id}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase() }))}
                  disabled={mode === "edit"}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="auto-generated"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.showPoweredBy}
                    onChange={(e) => setForm((f) => ({ ...f, showPoweredBy: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Show &quot;Powered by Parigrado&quot;
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Primary color *</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="h-10 w-12 cursor-pointer rounded border border-slate-200"
                  />
                  <input
                    value={form.primaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Secondary color *</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={form.secondaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                    className="h-10 w-12 cursor-pointer rounded border border-slate-200"
                  />
                  <input
                    value={form.secondaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Welcome headline *</label>
                <input
                  value={form.welcomeHeadline}
                  onChange={(e) => setForm((f) => ({ ...f, welcomeHeadline: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Welcome subheadline</label>
                <input
                  value={form.welcomeSubheadline}
                  onChange={(e) => setForm((f) => ({ ...f, welcomeSubheadline: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Hero description (CAA text)</label>
                <textarea
                  value={form.heroDescription}
                  onChange={(e) => setForm((f) => ({ ...f, heroDescription: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Tagline</label>
                <input
                  value={form.tagline}
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {mode === "create" ? "Create partner" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </section>

          <aside className="space-y-5">
            {mode === "edit" && editingId && (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-900">Share link</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Give this URL to your partner. Branding loads from the{" "}
                    <code className="text-indigo-700">partner</code> query param.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
                  >
                    Open preview
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-slate-900">Logo</h4>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG, SVG, or WebP · max 2 MB</p>
                  {(logoPreview || selectedPartner?.logoUrl) && (
                    <img
                      src={logoPreview ?? selectedPartner?.logoUrl ?? ""}
                      alt="Logo preview"
                      className="mt-3 max-h-20 max-w-full object-contain"
                    />
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="mt-3 w-full text-xs text-slate-600"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                  {logoFile && (
                    <button
                      type="button"
                      onClick={handleLogoUpload}
                      disabled={saving}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload logo
                    </button>
                  )}
                </section>
              </>
            )}

            {mode === "create" && (
              <section className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 text-sm text-slate-600">
                Save the partner first, then upload a logo and copy the share link.
              </section>
            )}
          </aside>
        </form>
      )}
    </div>
  );
}
