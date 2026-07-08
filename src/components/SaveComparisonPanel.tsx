import { Bookmark, Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";

interface Props {
  label: string;
  onLabelChange: (value: string) => void;
  shareUrl: string | null;
  saving: boolean;
  disabled?: boolean;
  onSave: () => void | Promise<void>;
}

export function SaveComparisonPanel({
  label,
  onLabelChange,
  shareUrl,
  saving,
  disabled,
  onSave,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <section className="no-print rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[14rem] flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
            <Bookmark className="h-4 w-4" />
            Save for later
          </div>
          <p className="mt-1 text-sm text-indigo-900/80">
            Store this comparison on Parigrado and get a short link you can reopen anytime or share with
            your board.
          </p>
          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-indigo-800">
            Label (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder="e.g. Mission vs Asheville peers — July board packet"
            className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={disabled || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bookmark className="h-4 w-4" />
            {saving ? "Saving…" : shareUrl ? "Update saved link" : "Save comparison"}
          </button>
          {shareUrl ? (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-900 shadow-sm transition hover:bg-indigo-100"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Link copied" : "Copy saved link"}
            </button>
          ) : null}
        </div>
      </div>
      {shareUrl ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-600">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-indigo-700" />
          <span className="truncate">{shareUrl}</span>
        </div>
      ) : null}
    </section>
  );
}
