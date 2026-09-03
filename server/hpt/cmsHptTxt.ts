export interface CmsHptLocation {
  locationName: string;
  sourcePageUrl?: string;
  mrfUrl: string;
}

function pickUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/^<|>$/g, "");
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

/** Parse hospital cms-hpt.txt (pipe/CSV, YAML-ish keys, or JSON). */
export function parseCmsHptTxt(text: string): CmsHptLocation[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      const rows = Array.isArray(json) ? json : [json];
      return rows.flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const o = row as Record<string, unknown>;
          const mrfUrl = pickUrl(String(o.mrf_url ?? o.mrfUrl ?? o.url ?? ""));
          const locationName = String(o.location_name ?? o.locationName ?? o.name ?? "");
          if (!mrfUrl) return [];
          return [{ locationName, mrfUrl, sourcePageUrl: pickUrl(String(o.source_page_url ?? "")) ?? undefined }];
        });
    } catch {
      /* fall through */
    }
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const yamlish: CmsHptLocation[] = [];
  let current: Partial<CmsHptLocation> = {};
  const flush = () => {
    if (current.mrfUrl) {
      yamlish.push({
        locationName: current.locationName ?? "",
        mrfUrl: current.mrfUrl,
        sourcePageUrl: current.sourcePageUrl,
      });
    }
    current = {};
  };
  for (const line of lines) {
    const m = line.match(/^(location[-_ ]?name|source[-_ ]?page[-_ ]?url|mrf[-_ ]?url)\s*[:=]\s*(.+)$/i);
    if (m) {
      const key = m[1]!.toLowerCase().replace(/[_\s]/g, "-");
      const val = m[2]!.trim();
      if (key.startsWith("location")) {
        if (current.mrfUrl) flush();
        current.locationName = val;
      } else if (key.startsWith("source")) current.sourcePageUrl = pickUrl(val) ?? val;
      else if (key.startsWith("mrf")) current.mrfUrl = pickUrl(val) ?? undefined;
      continue;
    }
  }
  flush();
  if (yamlish.length) return yamlish;

  const out: CmsHptLocation[] = [];
  for (const line of lines) {
    if (/^location/i.test(line) && /mrf/i.test(line)) continue;
    const delim = line.includes("|") ? "|" : line.includes("\t") ? "\t" : ",";
    const cols = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    const urls = cols.filter((c) => /^https?:\/\//i.test(c));
    const mrfUrl = urls.find((u) => /\.(csv|json|zip|gz)(\?|$)/i.test(u)) ?? urls[urls.length - 1];
    if (!mrfUrl) continue;
    const locationName = cols.find((c) => c && !/^https?:/i.test(c)) ?? "";
    out.push({ locationName, mrfUrl });
  }
  return out;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(the|inc|llc|llp|pc|hospital|medical|center|centre|health|healthcare|system|regional|campus|of)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function nameScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const ta = a.split(" ").filter((t) => t.length > 2);
  const tb = b.split(" ").filter((t) => t.length > 2);
  if (ta.length === 0 || tb.length === 0) return 0;

  // If every token of the shorter name appears in the longer, treat as a strong match
  // (e.g. "mission" ⊂ "memorial mission and asheville surgery").
  const [small, large] =
    ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  if (small.length > 0 && small.every((t) => large.has(t))) return 0.9;

  let inter = 0;
  const setB = new Set(tb);
  for (const t of ta) if (setB.has(t)) inter += 1;
  return inter / Math.max(ta.length, tb.length);
}

export function bestLocationMatch(hospitalName: string, locations: CmsHptLocation[]): CmsHptLocation | null {
  if (locations.length === 0) return null;
  if (locations.length === 1) return locations[0]!;
  const n = normalizeName(hospitalName);
  let best: CmsHptLocation | null = null;
  let bestScore = 0;
  for (const loc of locations) {
    const score = nameScore(n, normalizeName(loc.locationName));
    if (score > bestScore) {
      bestScore = score;
      best = loc;
    }
  }
  // Never fall back to the first listing — multi-hospital systems list many facilities.
  return bestScore >= 0.35 ? best : null;
}
