#!/usr/bin/env python3
"""
Build public/mission-tracker/staff-ratios.json from CMS Hospital Provider Cost
Report Final CSVs (FY2018–FY2023) plus HCRIS HOSP10FY2024 for FY2024.

Method matches Mission overlays: Worksheet S-3 Part I line 14 —
employees on payroll FTEs (col 10) ÷ beds (col 2). When a CCN has multiple
reports ending in the same fiscal year, the longest reporting period is kept.
"""

from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "hcris"
OUT = ROOT / "public" / "mission-tracker" / "staff-ratios.json"
HOSPITALS_JSON = ROOT / "data" / "hospitals.json"

COST_REPORT_URLS = {
    2018: "https://data.cms.gov/sites/default/files/2025-11/f5e15e03-0256-4e27-966a-74dfea926b72/CostReport_2018_Final.csv",
    2019: "https://data.cms.gov/sites/default/files/2025-11/832d1e75-27eb-44bb-af75-a6b827fd4fd9/CostReport_2019_Final.csv",
    2020: "https://data.cms.gov/sites/default/files/2025-11/bd432d70-3689-4e8e-a8a5-5e7bf5232cb6/CostReport_2020_Final.csv",
    2021: "https://data.cms.gov/sites/default/files/2025-11/7e94fd9d-9ef2-4275-b993-299e30f5b371/CostReport_2021_Final.csv",
    2022: "https://data.cms.gov/sites/default/files/2025-11/c298e529-8bee-401a-bbd8-a38e74e19ab2/CostReport_2022_Final.csv",
    2023: "https://data.cms.gov/sites/default/files/2026-01/3c39f483-c7e0-4025-8396-4df76942e10f/CostReport_2023_Final.csv",
}
HCRIS_2024_URL = "https://downloads.cms.gov/FILES/HCRIS/HOSP10FY2024.ZIP"

WKSHT = "S300001"
LINE14 = "01400"
COL_BEDS = "00200"
COL_FTE = "01000"


def parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def norm_ccn(raw: str) -> str:
    return str(raw or "").strip().zfill(6)


def ensure_file(path: Path, url: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 1000:
        return path
    print(f"Downloading {url} -> {path.name}", flush=True)
    urlretrieve(url, path)
    return path


def load_allowed_ccns() -> set[str] | None:
    if not HOSPITALS_JSON.exists():
        print(f"WARN: {HOSPITALS_JSON} missing; including all CCNs from cost reports", flush=True)
        return None
    data = json.loads(HOSPITALS_JSON.read_text())
    hospitals = data.get("hospitals") or []
    return {norm_ccn(h["facilityId"]) for h in hospitals if h.get("facilityId")}


def consider(
    best: dict[tuple[str, int], tuple],
    ccn: str,
    year: int,
    days: int,
    fte: float,
    beds: float,
) -> None:
    if beds <= 0 or fte <= 0:
        return
    key = (ccn, year)
    ratio = round(fte / beds, 1)
    cand = (days, ratio, round(fte, 2), round(beds, 1))
    prev = best.get(key)
    if prev is None or cand[0] > prev[0]:
        best[key] = cand


def ingest_cost_report(path: Path, year: int, best: dict, allowed: set[str] | None) -> int:
    n = 0
    with path.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            ccn = norm_ccn(row.get("Provider CCN") or "")
            if not ccn or ccn == "000000":
                continue
            if allowed is not None and ccn not in allowed:
                continue
            try:
                fte = float(row.get("FTE - Employees on Payroll") or 0)
                beds = float(row.get("Number of Beds") or 0)
            except ValueError:
                continue
            begin = parse_date(row.get("Fiscal Year Begin Date"))
            end = parse_date(row.get("Fiscal Year End Date"))
            # CostReport_YYYY files are year-scoped; still skip mismatched end years when present.
            if end is not None and end.year != year:
                continue
            days = (end - begin).days if begin and end else 0
            consider(best, ccn, year, days, fte, beds)
            n += 1
    return n


def ingest_hcris_2024(zip_path: Path, best: dict, allowed: set[str] | None) -> int:
    """Stream HOSP10FY2024.zip: RPT for CCN/dates, NMRC for S-3 line 14 beds/FTEs."""
    with zipfile.ZipFile(zip_path) as zf:
        names = {Path(n).name.lower(): n for n in zf.namelist()}
        rpt_name = next(n for k, n in names.items() if k.endswith("_rpt.csv"))
        nmrc_name = next(n for k, n in names.items() if k.endswith("_nmrc.csv"))

        # rpt_rec_num -> (ccn, days, end_year)
        reports: dict[str, tuple[str, int, int]] = {}
        with zf.open(rpt_name) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="")
            for row in csv.reader(text):
                if len(row) < 7:
                    continue
                rpt_id, ccn = row[0].strip(), norm_ccn(row[2])
                if not ccn or ccn == "000000":
                    continue
                if allowed is not None and ccn not in allowed:
                    continue
                begin, end = parse_date(row[5]), parse_date(row[6])
                if end is None or end.year != 2024:
                    continue
                days = (end - begin).days if begin and end else 0
                reports[rpt_id] = (ccn, days, end.year)

        print(f"  HCRIS 2024 reports in scope: {len(reports)}", flush=True)

        # rpt_id -> {beds, fte}
        vals: dict[str, dict[str, float]] = {}
        with zf.open(nmrc_name) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="")
            for row in csv.reader(text):
                if len(row) < 5:
                    continue
                rpt_id = row[0].strip()
                if rpt_id not in reports:
                    continue
                if row[1].strip() != WKSHT or row[2].strip() != LINE14:
                    continue
                col = row[3].strip()
                if col not in (COL_BEDS, COL_FTE):
                    continue
                try:
                    val = float(row[4])
                except ValueError:
                    continue
                slot = vals.setdefault(rpt_id, {})
                if col == COL_BEDS:
                    slot["beds"] = val
                else:
                    slot["fte"] = val

    n = 0
    for rpt_id, (ccn, days, year) in reports.items():
        slot = vals.get(rpt_id) or {}
        fte, beds = slot.get("fte"), slot.get("beds")
        if fte is None or beds is None:
            continue
        consider(best, ccn, year, days, fte, beds)
        n += 1
    return n


def build_payload(best: dict) -> dict:
    by_ccn: dict[str, dict[int, tuple]] = {}
    for (ccn, year), cand in best.items():
        by_ccn.setdefault(ccn, {})[year] = cand

    hospitals = {}
    for ccn, years in by_ccn.items():
        labels = sorted(years)
        hospitals[ccn] = {
            "labels": [str(y) for y in labels],
            "ratio": [years[y][1] for y in labels],
        }

    return {
        "source": (
            "CMS Hospital Provider Cost Report (Final) FY2018–FY2023; "
            "CMS HCRIS HOSP10FY2024.zip for FY2024"
        ),
        "method": (
            "Worksheet S-3 Part I line 14: employees on payroll FTEs (col 10) "
            "÷ beds (col 2); FY ends Sept. When multiple cost reports fall in "
            "the same fiscal year, the longest reporting period is used."
        ),
        "note": (
            "National extract for hospitals in the Parigrado directory. "
            "Overlays.json may override curated series for selected CCNs "
            "(e.g. Mission 340002 FY2018 bed-count methodology)."
        ),
        "years": [str(y) for y in range(2018, 2025)],
        "generatedAt": datetime.utcnow().strftime("%Y-%m-%d"),
        "hospitalCount": len(hospitals),
        "hospitals": hospitals,
    }


def main() -> int:
    allowed = load_allowed_ccns()
    if allowed is not None:
        print(f"Filtering to {len(allowed)} CCNs from hospitals.json", flush=True)

    best: dict[tuple[str, int], tuple] = {}

    for year, url in COST_REPORT_URLS.items():
        path = ensure_file(CACHE / f"CostReport_{year}_Final.csv", url)
        n = ingest_cost_report(path, year, best, allowed)
        print(f"FY{year} CostReport rows considered: {n}; unique keys so far: {len(best)}", flush=True)

    zip_path = ensure_file(CACHE / "HOSP10FY2024.ZIP", HCRIS_2024_URL)
    n = ingest_hcris_2024(zip_path, best, allowed)
    print(f"FY2024 HCRIS reports with FTE+beds: {n}; unique keys: {len(best)}", flush=True)

    payload = build_payload(best)
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(
        f"Wrote {OUT} ({size_mb:.2f} MiB) for {payload['hospitalCount']} hospitals",
        flush=True,
    )

    # Sanity: Mission should be present with ~7 years
    m = payload["hospitals"].get("340002")
    if m:
        print(f"Mission 340002: {list(zip(m['labels'], m['ratio']))}", flush=True)
    else:
        print("WARN: Mission 340002 missing from extract", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
