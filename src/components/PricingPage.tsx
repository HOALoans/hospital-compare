import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleDollarSign,
  Loader2,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HospitalSummary } from "@shared/types";
import type { HptCompareResponse, HptHospitalValue, HptMetric, HptPayer } from "@shared/hpt";
import { DEFAULT_HCPCS_CODES, HCPCS_CODE_LABELS, HPT_DEFAULT_VISIBLE, HPT_MAX_CODES } from "@shared/hpt";
import { CHART } from "@shared/chartTheme";
import { HospitalSearch } from "@/components/HospitalSearch";
import { CompareHospitalPicker } from "@/components/CompareHospitalPicker";
import { fetchHptCompare } from "@/lib/api";

type SortKey = "code" | "hospital" | "national" | "zip3" | `compare:${string}`;
type SortDir = "asc" | "desc";

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pctLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(0)}th`;
}

function shortHospitalName(name: string): string {
  return name
    .replace(/\bHOSPITAL\b/gi, "")
    .replace(/\bAND\b/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function bandLabel(band: HptHospitalValue["nationalBand"]): string {
  switch (band) {
    case "low":
      return "Lower quarter";
    case "below_median":
      return "Below median";
    case "above_median":
      return "Above median";
    case "high":
      return "Upper quarter";
    default:
      return "—";
  }
}

function bandClass(band: HptHospitalValue["nationalBand"]): string {
  switch (band) {
    case "low":
      return "bg-emerald-100 text-emerald-900";
    case "below_median":
      return "bg-sky-100 text-sky-900";
    case "above_median":
      return "bg-amber-100 text-amber-900";
    case "high":
      return "bg-rose-100 text-rose-900";
    default:
      return "text-slate-400";
  }
}

interface Props {
  onBack: () => void;
}

export function PricingPage({ onBack }: Props) {
  const [hospital, setHospital] = useState<HospitalSummary | null>(null);
  const [compareWith, setCompareWith] = useState<HospitalSummary[]>([]);
  const [codeInput, setCodeInput] = useState(DEFAULT_HCPCS_CODES.join(", "));
  const [lookupCode, setLookupCode] = useState("");
  const [metric, setMetric] = useState<HptMetric>("median");
  const [payer, setPayer] = useState<HptPayer>("all");
  const [mode, setMode] = useState<"snapshot" | "trend">("snapshot");
  const [showMore, setShowMore] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [trendCode, setTrendCode] = useState<string>("");
  const [data, setData] = useState<HptCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codes = useMemo(
    () =>
      [...new Set(
        codeInput
          .split(/[\s,]+/)
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      )].slice(0, HPT_MAX_CODES),
    [codeInput],
  );

  const toggleCode = (code: string) => {
    const set = new Set(codes);
    if (set.has(code)) set.delete(code);
    else if (set.size < HPT_MAX_CODES) set.add(code);
    setCodeInput([...set].join(", "));
  };

  const runLookup = () => {
    const code = lookupCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return;
    setCodeInput(code);
    setLookupCode(code);
    setShowMore(true);
  };

  useEffect(() => {
    if (!hospital || codes.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      setError(null);
      fetchHptCompare({
        hospitalId: hospital.facilityId,
        codes,
        compareWith: compareWith.map((h) => h.facilityId),
        metric,
        payer,
      })
        .then((res) => {
          if (cancelled) return;
          setData(res);
          const waiting =
            (res.pendingHospital && !res.crawlError) ||
            (res.pendingCompareIds?.length ?? 0) > 0 ||
            // Retry shortly after a timeout so Mission-sized files get another chance.
            Boolean(res.crawlError && /timed out/i.test(res.crawlError));
          if (waiting) timer = setTimeout(() => load(false), 5000);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load prices");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hospital, codes, compareWith, metric, payer]);

  useEffect(() => {
    if (!data?.rows.length) return;
    if (!trendCode || !data.rows.some((r) => r.code === trendCode)) {
      setTrendCode(data.rows[0]!.code);
    }
  }, [data, trendCode]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "code" ? "asc" : "desc");
    }
  };

  const sortedRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const copy = [...rows];
    const valueOf = (row: (typeof rows)[number]): number => {
      if (sortKey === "code") return 0;
      if (sortKey === "hospital") return row.hospital.value ?? -Infinity;
      if (sortKey === "national") {
        return (metric === "mean" ? row.national.mean : row.national.median) ?? -Infinity;
      }
      if (sortKey === "zip3") {
        return (metric === "mean" ? row.zip3.mean : row.zip3.median) ?? -Infinity;
      }
      if (sortKey.startsWith("compare:")) {
        const id = sortKey.slice("compare:".length);
        return row.compare.find((c) => c.facilityId === id)?.value ?? -Infinity;
      }
      return -Infinity;
    };
    copy.sort((a, b) => {
      if (sortKey === "code") return a.code.localeCompare(b.code, undefined, { numeric: true });
      return valueOf(a) - valueOf(b);
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
  }, [data, sortKey, sortDir, metric]);

  const visibleRows = showMore ? sortedRows : sortedRows.slice(0, HPT_DEFAULT_VISIBLE);
  const trend = data?.trends.find((t) => t.code === trendCode);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white">
            <CircleDollarSign className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-2xl text-slate-900">HCPCS price comparison</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Standard charges from each hospital&apos;s CMS machine-readable file. Mission and
              Pardee load from a pre-built extract so common codes appear immediately; other
              hospitals download on demand. Prefer{" "}
              <span className="font-medium">All payers</span> — many hospitals omit discounted cash
              prices.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <HospitalSearch onSelect={(h) => { setHospital(h); setCompareWith([]); }} />
        </div>

        {hospital && (
          <p className="mt-3 text-sm text-slate-700">
            Selected: <span className="font-semibold">{hospital.name}</span> ({hospital.city}, {hospital.state}
            {hospital.zip3 ? ` · ZIP ${hospital.zip3}xx` : ""})
            <button type="button" className="ml-3 text-brand-primary underline" onClick={onBack}>
              Back to home
            </button>
          </p>
        )}

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <label className="block text-sm font-medium text-slate-800">
            Look up one HCPCS / CPT code
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Enter a code to replace the table with that procedure for the selected hospitals.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runLookup();
                }
              }}
              placeholder="e.g. 70450"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm sm:max-w-[12rem]"
            />
            <button
              type="button"
              onClick={runLookup}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              Compare this code
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className="block text-sm font-medium text-slate-700">
              HCPCS codes ({codes.length}/{HPT_MAX_CODES})
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="font-semibold text-brand-primary underline"
                onClick={() => setCodeInput(DEFAULT_HCPCS_CODES.join(", "))}
              >
                All common ({DEFAULT_HCPCS_CODES.length})
              </button>
              <button
                type="button"
                className="font-semibold text-slate-500 underline"
                onClick={() => setCodeInput(DEFAULT_HCPCS_CODES.slice(0, 10).join(", "))}
              >
                Top 10
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEFAULT_HCPCS_CODES.map((code) => {
              const on = codes.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCode(code)}
                  title={HCPCS_CODE_LABELS[code] ?? code}
                  className={`rounded border px-2 py-1 font-mono text-xs ${
                    on
                      ? "border-brand-primary bg-brand-primary/10 text-slate-900"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>
          <textarea
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            rows={2}
            placeholder="Or paste any HCPCS/CPT codes, comma-separated"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="text-sm text-slate-700">
            Metric{" "}
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as HptMetric)}
              className="ml-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="median">Median</option>
              <option value="mean">Mean</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Payer{" "}
            <select
              value={payer}
              onChange={(e) => setPayer(e.target.value as HptPayer)}
              className="ml-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="all">All payers (negotiated)</option>
              <option value="cash">Cash / self-pay</option>
            </select>
          </label>
          <label className="text-sm text-slate-700">
            View{" "}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "snapshot" | "trend")}
              className="ml-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5"
            >
              <option value="snapshot">Snapshot</option>
              <option value="trend">Trend</option>
            </select>
          </label>
        </div>

        {hospital && (
          <div className="mt-5">
            <CompareHospitalPicker
              baseHospitalId={hospital.facilityId}
              selected={compareWith}
              onChange={setCompareWith}
              hint="Search to add another hospital as its own price column"
            />
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {loading && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading charges…
        </p>
      )}

      {data?.pendingHospital && !data.crawlError && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Downloading {data.hospital.name.split(" ").slice(0, 3).join(" ")}
          &apos;s CMS price file. Large hospitals can take several minutes; the table fills in
          automatically.
        </p>
      )}

      {(data?.pendingCompareIds?.length ?? 0) > 0 && (
        <p className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Downloading comparison hospital price file
          {(data?.pendingCompareIds.length ?? 0) > 1 ? "s" : ""}…
        </p>
      )}

      {data?.crawlError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {data.hospital.name.split(" ").slice(0, 3).join(" ")}: {data.crawlError}. Retrying
          automatically when possible — or re-select the hospital after a minute.
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-slate-600">
            {data.note} Coverage: {data.coverage.crawledOk.toLocaleString()} ok /{" "}
            {data.coverage.hospitalCount.toLocaleString()} hospitals attempted
            {data.snapshotDate ? ` · snapshot ${data.snapshotDate}` : ""}.
          </p>
          {(data.rows[0]?.national.n ?? 0) < 5 && (
            <p className="text-sm text-amber-800">
              National bands need a larger sample. With n={data.rows[0]?.national.n ?? 0}, a single
              hospital can dominate the &quot;national&quot; column until more files load.
            </p>
          )}

          {mode === "snapshot" && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("code")}>
                        HCPCS <SortIcon col="code" />
                      </button>
                    </th>
                    <th className="px-3 py-3">Description</th>
                    <th className="px-3 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("hospital")}>
                        {shortHospitalName(data.hospital.name)} <SortIcon col="hospital" />
                      </button>
                    </th>
                    {data.rows[0]?.compare.map((c) => (
                      <th key={c.facilityId} className="px-3 py-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold"
                          onClick={() => toggleSort(`compare:${c.facilityId}`)}
                        >
                          {shortHospitalName(c.name)} <SortIcon col={`compare:${c.facilityId}`} />
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("national")}>
                        National <SortIcon col="national" />
                      </button>
                    </th>
                    <th className="px-3 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("zip3")}>
                        {data.rows[0]?.zip3Label ?? "ZIP3"} <SortIcon col="zip3" />
                      </button>
                    </th>
                    <th className="px-3 py-3">vs national</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.code} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono font-semibold text-slate-900">{row.code}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-slate-600" title={row.description ?? ""}>
                        {row.description ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-medium">{money(row.hospital.value)}</td>
                      {row.compare.map((c) => (
                        <td key={c.facilityId} className="px-3 py-2 font-medium">
                          {money(c.value)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-slate-600">
                        {money(metric === "mean" ? row.national.mean : row.national.median)}
                        <span className="block text-xs text-slate-400">n={row.national.n}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {money(metric === "mean" ? row.zip3.mean : row.zip3.median)}
                        <span className="block text-xs text-slate-400">n={row.zip3.n}</span>
                      </td>
                      <td className="px-3 py-2">
                        {row.hospital.nationalBand ? (
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${bandClass(row.hospital.nationalBand)}`}>
                            {bandLabel(row.hospital.nationalBand)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {row.hospital.percentile != null ? `${pctLabel(row.hospital.percentile)} pct` : ""}
                          {row.hospital.quartile ? ` · Q${row.hospital.quartile}` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedRows.length > 10 && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="text-sm font-semibold text-brand-primary"
                  >
                    {showMore ? "Show fewer codes" : `Show all ${sortedRows.length} codes`}
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "trend" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="text-sm font-medium text-slate-700">
                Code{" "}
                <select
                  value={trendCode}
                  onChange={(e) => setTrendCode(e.target.value)}
                  className="ml-1 rounded-lg border border-slate-300 px-2 py-1.5"
                >
                  {(data.trends ?? []).map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code} {t.description ? `— ${t.description.slice(0, 40)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {trend && trend.points.length > 0 ? (
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend.points}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis tickFormatter={(v) => money(Number(v))} width={80} />
                      <Tooltip formatter={(v) => money(Number(v))} />
                      <Legend />
                      <Line type="monotone" dataKey="hospital" name="Hospital" stroke={CHART.baseHospital} dot />
                      <Line type="monotone" dataKey="zip3" name="ZIP-3" stroke={CHART.county} dot />
                      <Line type="monotone" dataKey="national" name="National" stroke={CHART.national} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Trend needs repeat crawls of the same hospital MRF over time. The first snapshot
                  appears as a single point until the next crawl.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
