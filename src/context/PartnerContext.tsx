import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  resolvePartner,
  type PartnerBranding,
} from "@shared/partnerConfig";

function readPartnerIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("partner");
}

function subscribeToUrlChanges(onChange: () => void) {
  const notify = () => onChange();
  window.addEventListener("popstate", notify);

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    originalPushState(...args);
    notify();
  };
  history.replaceState = (...args) => {
    originalReplaceState(...args);
    notify();
  };

  return () => {
    window.removeEventListener("popstate", notify);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}

function darkenHex(hex: string, amount = 0.12): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = Math.max(0, Math.round(parseInt(normalized.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(normalized.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(normalized.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type PartnerContextValue = {
  partner: PartnerBranding;
  partnerId: string | null;
  isPartnerMode: boolean;
};

const PartnerContext = createContext<PartnerContextValue | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const partnerId = useSyncExternalStore(
    subscribeToUrlChanges,
    readPartnerIdFromUrl,
    () => null,
  );

  const partner = useMemo(() => resolvePartner(partnerId), [partnerId]);
  const isPartnerMode = partnerId !== null && partnerId !== "default";

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", partner.primaryColor);
    root.style.setProperty("--brand-secondary", partner.secondaryColor);
    root.style.setProperty(
      "--brand-primary-hover",
      darkenHex(partner.primaryColor),
    );
  }, [partner]);

  const value = useMemo(
    () => ({ partner, partnerId, isPartnerMode }),
    [partner, partnerId, isPartnerMode],
  );

  return (
    <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>
  );
}

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) {
    throw new Error("usePartner must be used within PartnerProvider");
  }
  return ctx;
}
