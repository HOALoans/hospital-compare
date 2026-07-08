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
      className="no-print inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-primary/90"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
      {copied ? "Link copied" : "Copy current link"}
    </button>
  );
}
