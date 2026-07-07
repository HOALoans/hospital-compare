import { useState } from "react";
import { ChevronDown, ExternalLink, HelpCircle } from "lucide-react";
import type { MeasureDefinition } from "@shared/measures";
import { getMeasureHelp } from "@shared/measureHelp";
import { defaultSourceForDataset } from "@shared/measureHelp";

interface Props {
  measure: MeasureDefinition;
}

export function MeasureHelp({ measure }: Props) {
  const [open, setOpen] = useState(false);
  const help = getMeasureHelp(measure.id);
  const source = help ?? defaultSourceForDataset(measure.dataset);
  const plainEnglish = help?.plainEnglish ?? measure.description;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 no-print"
        aria-expanded={open}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        What does this mean?
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="measure-help-panel mt-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs leading-relaxed text-slate-700">
          <p>{plainEnglish}</p>
          <a
            href={help?.sourceUrl ?? source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
          >
            {help?.sourceLabel ?? source.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}
