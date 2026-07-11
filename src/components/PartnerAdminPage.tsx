import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  ImageIcon,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { PartnerBranding } from "@shared/partnerConfig";
import { HEX_COLOR_RE, slugifyPartnerId } from "@shared/partnerConfig";
import {
  AdminAuthError,
  adminLogin,
  clearStoredAdminSession,
  createPartnerApi,
  deletePartnerApi,
  getStoredAdminEmail,
  getStoredAdminToken,
  listPartners,
  setStoredAdminSession,
  updatePartnerApi,
  uploadPartnerLogo,
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
  gated: boolean;
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
  gated: false,
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
    gated: partner.gated ?? false,
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
    gated: form.gated,
  };
}

interface Props {
  onExit: () => void;
}

function LogoUploadPanel({
  currentLogoUrl,
  logoPreview,
  logoFile,
  saving,
  isCreate,
  onPickFile,
  onUpload,
  fileInputRef,
}: {
  currentLogoUrl?: string;
  logoPreview: string | null;
  logoFile: File | null;
  saving: boolean;
  isCreate: boolean;
  onPickFile: (file: File | null) => void;
  onUpload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const previewSrc = logoPreview ?? currentLogoUrl ?? null;

  return (
    <section className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <ImageIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold text-slate-900">Partner logo</h4>
          <p className="mt-1 text-sm text-slate-600">
            {isCreate
              ? "Optional — pick a logo now and it will upload when you create the partner."
              : "Upload your partner's logo. It appears in the navbar and share links."}
          </p>
          <p className="mt-1 text-xs text-slate-500">PNG, JPG, SVG, or WebP · max 2 MB</p>
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-800">
            <span className="font-semibold">Trademark note:</span> demo/concept previews may use a
            typographic placeholder wordmark (e.g. the AARP concept preview). A production co-brand
            must use licensed brand assets supplied by the partner under a signed agreement.
          </p>
        </div>
      </div>

      {previewSrc ? (
        <div className="mt-4 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
          <img
            src={previewSrc}
            alt="Logo preview"
            className="max-h-16 max-w-[10rem] object-contain"
          />
          {logoFile && (
            <span className="text-xs text-slate-500">New: {logoFile.name}</span>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No logo yet — choose an image below
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="sr-only"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          <Upload className="h-4 w-4" />
          Choose logo image
        </button>
        {!isCreate && logoFile && (
          <button
            type="button"
            onClick={onUpload}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Upload now
          </button>
        )}
        {logoFile && (
          <button
            type="button"
            onClick={() => {
              onPickFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear selection
          </button>
        )}
      </div>
    </section>
  );
}

export function PartnerAdminPage({ onExit }: Props) {
  const [adminToken, setAdminToken] = useState<string | null>(() => getStoredAdminToken());
  const [adminEmail, setAdminEmail] = useState<string | null>(() => getStoredAdminEmail());
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
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

  const loadPartners = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const data = await listPartners(token);
      setPartners(data.partners);
    } catch (err) {
      if (err instanceof AdminAuthError && err.status === 401) {
        clearStoredAdminSession();
        setAdminToken(null);
        setAdminEmail(null);
        setAuthError("Your session expired. Please sign in again.");
        return;
      }
      flash("err", err instanceof Error ? err.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    if (adminToken) loadPartners(adminToken);
  }, [adminToken, loadPartners]);

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
    try {
      const { token, email } = await adminLogin(emailInput, passwordInput);
      setStoredAdminSession(token, email);
      setAdminToken(token);
      setAdminEmail(email);
      setEmailInput("");
      setPasswordInput("");
    } catch (err) {
      setAuthError(
        err instanceof AdminAuthError ? err.message : "Invalid email or password",
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    clearStoredAdminSession();
    setAdminToken(null);
    setAdminEmail(null);
    void fetch("/api/admin/logout", { method: "POST" });
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
    if (!adminToken) return;
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
        saved = await createPartnerApi(adminToken, payload);
        flash("ok", `Created partner "${saved.displayName}"`);
      } else if (editingId) {
        saved = await updatePartnerApi(adminToken, editingId, payload);
        flash("ok", `Updated partner "${saved.displayName}"`);
      } else {
        return;
      }

      if (logoFile) {
        saved = await uploadPartnerLogo(adminToken, saved.id, logoFile);
        flash("ok", "Logo uploaded");
      }

      await loadPartners(adminToken);
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
    if (!adminToken || !editingId || !logoFile) return;
    setSaving(true);
    try {
      const saved = await uploadPartnerLogo(adminToken, editingId, logoFile);
      flash("ok", "Logo uploaded");
      setLogoFile(null);
      setForm(partnerToForm(saved));
      await loadPartners(adminToken);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!adminToken || id === "default") return;
    if (!window.confirm(`Delete partner "${id}"? This cannot be undone.`)) return;
    try {
      await deletePartnerApi(adminToken, id);
      flash("ok", "Partner deleted");
      if (editingId === id) cancelForm();
      await loadPartners(adminToken);
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

  if (!adminToken) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="rounded-2xl border border-indigo-200 bg-white p-8 shadow-lg shadow-indigo-900/5">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl text-slate-900">Partner admin sign in</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with your authorized email and password to manage partner branding.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@company.com"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                autoComplete="current-password"
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
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {adminEmail && (
            <span className="self-center text-sm text-slate-600">
              Signed in as <span className="font-medium text-slate-800">{adminEmail}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to site
          </button>
          <button
            type="button"
            onClick={handleSignOut}
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

      <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold">Partners persist on the attached disk</p>
          <p className="mt-1 text-emerald-800">
            Partner records and logos are stored on Render&apos;s persistent disk, so they survive
            redeploys. If you just enabled the disk, re-create any partners that were lost on
            ephemeral storage once — after that they are kept permanently.
          </p>
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
        <>
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-800">Logo upload:</span> only custom partners
            can have logos. Click <span className="font-medium">New partner</span> or the pencil
            icon on an existing partner — the logo panel is at the top of the edit form. The
            built-in Parigrado theme is read-only.
          </p>
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
        </>
      )}

      {(mode === "create" || mode === "edit") && (
        <form onSubmit={handleSave} className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <button
              type="button"
              onClick={cancelForm}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to partner list
            </button>

            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {mode === "create" ? "Create partner" : `Edit ${editingId}`}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {mode === "create"
                  ? "Fill in branding details, optionally add a logo, then save."
                  : "Update branding or upload a new logo, then save or return to the list."}
              </p>
            </div>

            <LogoUploadPanel
              currentLogoUrl={selectedPartner?.logoUrl}
              logoPreview={logoPreview}
              logoFile={logoFile}
              saving={saving}
              isCreate={mode === "create"}
              onPickFile={setLogoFile}
              onUpload={handleLogoUpload}
              fileInputRef={fileInputRef}
            />

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
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.gated}
                    onChange={(e) => setForm((f) => ({ ...f, gated: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Gate behind demo access code (private preview)
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to partner list
              </button>
            </div>
          </section>

          <aside className="space-y-5">
            {mode === "edit" && editingId && (
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
            )}

            {mode === "create" && (
              <section className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5 text-sm text-slate-600">
                After you create the partner, the share link will appear here. You can also upload
                the logo above before saving — it uploads automatically with the partner.
              </section>
            )}
          </aside>
        </form>
      )}
    </div>
  );
}
