import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { Loader2 } from "lucide-react";
import App from "./App";
import { PartnerProvider, usePartner } from "@/context/PartnerContext";
import { PartnerGate, hasGateUnlock } from "@/components/PartnerGate";
import "./index.css";

function GatedApp() {
  const { partner, isPartnerMode, partnerLoading } = usePartner();
  // Bump to force a re-render (and re-read of sessionStorage) after unlocking.
  const [, forceUnlockCheck] = useState(0);
  const unlocked = hasGateUnlock(partner.id);

  // Avoid flashing the public app while a gated partner's branding is still loading.
  if (isPartnerMode && partnerLoading && !unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (partner.gated && !unlocked) {
    return <PartnerGate partner={partner} onUnlock={() => forceUnlockCheck((n) => n + 1)} />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PartnerProvider>
      <GatedApp />
    </PartnerProvider>
  </React.StrictMode>,
);
