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
import type { HptCompareResponse, HptMetric, HptPayer } from "@shared/hpt";
import { DEFAULT_HCPCS_CODES, HCPCS_CODE_LABELS, HPT_DEFAULT_VISIBLE, HPT_MAX_CODES } from "@shared/hpt";
import { CHART } from "@shared/chartTheme";
import { HospitalSearch } from "@/components/HospitalSearch";
import { CompareHospitalPicker } from "@/components/CompareHospitalPicker";
import { fetchHptCompare } from "@/lib/api";

type SortKey = "code" | "price";
type SortDir = "asc" | "desc";

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pctLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(0)}th`;
}

interface Props {
  onBack: () => void;
}

export function PricingPage({ onBack }: Props) {
  const [hospital, setHospital] = useState<HospitalSummary | null>(null);
  const [compareWith, setCompareWith] = useState<HospitalSummary[]>([]);
  const [codeInput, setCodeInput] = useState(DEFAULT_HCPCS_CODES.join(", "));
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
          const waiting = res.pendingHospital && !res.crawlError;
          if (waiting) timer = setTimeout(() => load(false), 4000);
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
    copy.sort((a, b) => {
      if (sortKey === "code") return a.code.localeCompare(b.code, undefined, { numeric: true });
      const av = a.hospital.value ?? -Infinity;
      const bv = b.hospital.value ?? -Infinity;
      return av - bv;
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
  }, [data, sortKey, sortDir]);

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
              Standard charges from each hospital&apos;s CMS machine-readable file (not a third-party
              API). Compare cash and all-payer negotiated rates to national and ZIP-3 peers, including
              quartile and whether a price sits in the top 1% of crawled hospitals. Prefer{" "}
              <span className="font-medium">All payers</span> — many hospitals (including HCA) omit
              discounted cash prices and only publish negotiated amounts.
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
            <p className="mb-2 text-sm font-medium text-slate-700">Compare additional hospitals</p>
            <CompareHospitalPicker
              baseHospitalId={hospital.facilityId}
              selected={compareWith}
              onChange={setCompareWith}
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
          Downloading this hospital&apos;s CMS price file
          {data.coverage.running ? " (in progress)" : ""}. Large hospitals can take several
          minutes; the table fills in automatically.
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-slate-600">
            {data.note} Coverage: {data.coverage.crawledOk.toLocaleString()} ok /{" "}
            {data.coverage.hospitalCount.toLocaleString()} hospitals
            {data.snapshotDate ? ` · snapshot ${data.snapshotDate}` : ""}.
          </p>
          {(data.rows[0]?.national.n ?? 0) <= 1 && (
            <p className="text-sm text-amber-800">
              National figures match this hospital when only one price file has been crawled
              (n={data.rows[0]?.national.n ?? 0}). They diverge as more hospitals load.
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
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("price")}>
                        Hospital <SortIcon col="price" />
                      </button>
                    </th>
                    <th className="px-3 py-3">National</th>
                    <th className="px-3 py-3">{data.rows[0]?.zip3Label ?? "ZIP3"}</th>
                    <th className="px-3 py-3">Quartile</th>
                    <th className="px-3 py-3">Top 1%</th>
                    {data.rows[0]?.compare.map((c) => (
                      <th key={c.facilityId} className="px-3 py-3">{c.name.split(" ").slice(0, 3).join(" ")}</th>
                    ))}
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
                      <td className="px-3 py-2 text-slate-600">
                        {money(metric === "mean" ? row.national.mean : row.national.median)}
                        <span className="block text-xs text-slate-400">n={row.national.n}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {money(metric === "mean" ? row.zip3.mean : row.zip3.median)}
                        <span className="block text-xs text-slate-400">n={row.zip3.n}</span>
                      </td>
                      <td className="px-3 py-2">
                        {row.hospital.quartile ? `Q${row.hospital.quartile}` : "—"}
                        <span className="block text-xs text-slate-400">{pctLabel(row.hospital.percentile)}</span>
                      </td>
                      <td className="px-3 py-2">
                        {row.hospital.top1Percent ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      {row.compare.map((c) => (
                        <td key={c.facilityId} className="px-3 py-2">
                          {money(c.value)}
                          {c.top1Percent ? <span className="ml-1 text-xs text-red-700">top 1%</span> : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedRows.length > HPT_DEFAULT_VISIBLE && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="text-sm font-semibold text-brand-primary"
                  >
                    {showMore ? "Show 10 codes" : `Show all ${sortedRows.length} codes`}
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
