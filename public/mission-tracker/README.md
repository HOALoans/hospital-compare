# Hospital Health Dashboard

Hospital quality/safety dashboard on Parigrado.

**URL:** https://parigrado.com/mission-tracker/?ccn=340002

Linked from the Parigrado homepage and header nav. CMS pulls go through `/api/cms/query/:dataset` (server proxy) to avoid browser CORS errors.

## What it does

- Load **any hospital** by CCN or name search (uses Parigrado `/api/hospitals/*` when available, otherwise CMS APIs).
- CMS Care Compare: HCAHPS stars, overall rating, HAIs, mortality, complications, readmissions, top vs low patient ratings (9–10 vs ≤6) with **national** comparison.
- Optional **overlays** from `overlays.json` when curated for that CCN: Mission `340002` has IJ / staff-to-bed override / travelers / star history; Forsyth `340014` has CMS HCAHPS + overall star history only (no IJ/travelers overlays).
- **Staff-to-bed** for any hospital with HCRIS data via `staff-ratios.json` (national extract); overlays can still override a CCN.
- Configurable **trend window** (3 / 5 / 7 / 10 years) with increasing / decreasing / staying-the-same badges.

## Files

| File | Role |
|------|------|
| `index.html` | Dashboard UI |
| `staff-ratios.json` | National staff-to-bed by CCN (FY2018–FY2024 HCRIS extract) |
| `overlays.json` | Per-CCN curated series (IJ, traveler estimates, optional staff override) |
| `charts.json` / `data.json` | Legacy Mission snapshots (refresh still updates these) |
| `refresh.mjs` | CMS snapshot refresh for Mission JSON |
| `vendor/chart.umd.js` | Chart.js |

Rebuild staff ratios: `npm run build:staff-ratios` (downloads CMS Cost Report Final CSVs + HOSP10FY2024 into `.cache/hcris/`).

## Notes

- Staff-to-bed = CMS Worksheet S-3 Part I line 14: employees on payroll FTEs (col 10) ÷ beds (col 2); FY ends Sept. Source: Hospital Provider Cost Report Final FY2018–FY2023 + HCRIS HOSP10FY2024. When multiple reports share a fiscal year, the longest period is kept. Mission `340002` overlay may override (e.g. curated FY2018).
- Travel nurse card plots Watchdog headcounts and traveler % of nursing staff when a denominator exists: Sep 2023 ≈ 22%, Feb 2024 ≈ 23% (vacancy-implied filled permanent RNs + travelers), Dec 2025 ≈ 26% (staffing-list FT + travelers). National benchmark line at 3.5% (typical ~3–4%; Vander Weerdt et al., Health Care Manage Rev. 2023).
- Trend window changes re-render from the last loaded snapshot (no CMS re-fetch) so overlapping loads cannot blank charts. If fewer than N years exist, available years are shown with a note.
- Top vs low rating **ratio** = (% 9–10) ÷ (% ≤6); national from CMS dataset `99ue-w85f`. Shown as a current snapshot (CMS does not publish a long public 9–10/≤6 history); year-over-year trend is on the HCAHPS stars card.
