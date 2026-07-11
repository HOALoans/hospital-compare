import { useState, type FormEvent } from "react";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";
import type { PartnerBranding } from "@shared/partnerConfig";

/**
 * Demo access codes for gated partner previews. This is a lightweight,
 * presentation-ready gate — NOT a security boundary. It keeps the branded
 * concept out of the fully-public site while it is being pitched.
 */
const DEMO_ACCESS_CODES: Record<string, string> = {
  aarp: "aarp2026",
};

/** Fallback code accepted for any gated partner without a specific entry. */
const MASTER_DEMO_CODE = "parigrado-preview";

function unlockKey(id: string): string {
  return `parigrado:gate-unlocked:${id}`;
}

export function hasGateUnlock(id: string): boolean {
  try {
    return window.sessionStorage.getItem(unlockKey(id)) === "1";
  } catch {
    return false;
  }
}

function storeGateUnlock(id: string): void {
  try {
    window.sessionStorage.setItem(unlockKey(id), "1");
  } catch {
    /* ignore storage failures — gate still unlocks for this render */
  }
}

function storeLead(id: string, email: string): void {
  try {
    window.localStorage.setItem(
      `parigrado:gate-lead:${id}`,
      JSON.stringify({ email, at: new Date().toISOString() }),
    );
  } catch {
    /* non-critical */
  }
}

function codeMatches(partnerId: string, entered: string): boolean {
  const normalized = entered.trim().toLowerCase();
  if (!normalized) return false;
  const expected = DEMO_ACCESS_CODES[partnerId];
  return normalized === expected?.toLowerCase() || normalized === MASTER_DEMO_CODE;
}

interface Props {
  partner: PartnerBranding;
  onUnlock: () => void;
}

export function PartnerGate({ partner, onUnlock }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accent = partner.primaryColor;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!codeMatches(partner.id, code)) {
      setError("That access code isn't valid. Please check with your Parigrado contact.");
      return;
    }
    storeLead(partner.id, email.trim());
    storeGateUnlock(partner.id);
    onUnlock();
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div
              className="flex flex-col items-center gap-4 px-8 py-8 text-center"
              style={{ backgroundColor: accent }}
            >
              {partner.logoUrl ? (
                <img
                  src={partner.logoUrl}
                  alt={partner.logoAlt ?? partner.displayName}
                  className="h-12 max-w-[12rem] object-contain drop-shadow-sm"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              ) : (
                <span className="font-display text-3xl font-black tracking-tight text-white">
                  {partner.displayName}
                </span>
              )}
              <p className="text-sm font-medium text-white/90">
                {partner.tagline ?? "Hospital quality comparison"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
              <div className="flex items-center gap-2 text-slate-900">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: accent }}
                >
                  <Lock className="h-4 w-4" />
                </span>
                <div>
                  <h1 className="text-lg font-semibold leading-tight">Partner preview</h1>
                  <p className="text-xs text-slate-500">Private partnership concept</p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-slate-600">
                This is a private preview prepared for the AARP partnership team. Enter your
                email and the access code you were given to open the branded demo.
              </p>

              <div>
                <label htmlFor="gate-email" className="block text-sm font-medium text-slate-700">
                  Work email
                </label>
                <input
                  id="gate-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@aarp.org"
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as string]: `${accent}33` }}
                />
              </div>

              <div>
                <label htmlFor="gate-code" className="block text-sm font-medium text-slate-700">
                  Access code
                </label>
                <input
                  id="gate-code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter demo access code"
                  required
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as string]: `${accent}33` }}
                />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                Unlock preview
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  Partnership concept only — <strong>not an official AARP product</strong>.
                  Quality data comes from public CMS &amp; CDC datasets. Branding shown is a
                  placeholder; a production build would use licensed AARP brand assets.
                </span>
              </div>
            </form>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            Powered by Parigrado · Independent hospital quality comparison
          </p>
        </div>
      </div>
    </div>
  );
}
