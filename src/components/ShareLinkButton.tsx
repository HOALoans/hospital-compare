import { Link2, Check } from "lucide-react";
import { useState } from "react";

interface Props {
  onCopy: () => void;
}

export function ShareLinkButton({ onCopy }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    onCopy();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // URL still updated via onCopy
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="no-print inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-primary/90 sm:px-4"
    >
      {copied ? <Check className="h-4 w-4 shrink-0 text-emerald-200" /> : <Link2 className="h-4 w-4 shrink-0" />}
      <span className="hidden sm:inline">{copied ? "Link copied" : "Copy current link"}</span>
      <span className="sm:hidden">{copied ? "Copied" : "Share"}</span>
    </button>
  );
}
