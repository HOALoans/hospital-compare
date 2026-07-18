# Hospital Health Dashboard

Hospital quality/safety dashboard on Parigrado.

**URL:** https://parigrado.com/mission-tracker/?ccn=340002

Linked from the Parigrado homepage and header nav. CMS pulls go through `/api/cms/query/:dataset` (server proxy) to avoid browser CORS errors.

## What it does

- Load **any hospital** by CCN or name search (uses Parigrado `/api/hospitals/*` when available, otherwise CMS APIs).
- CMS Care Compare: HCAHPS stars, overall rating, HAIs, mortality, complications, readmissions, top vs low patient ratings (9–10 vs ≤6) with **national** comparison.
- Optional **overlays** (Immediate Jeopardy, staff-to-bed, travelers, overall CMS star history) from `overlays.json` when curated for that CCN (Mission `340002` included).
- Configurable **trend window** (3 / 5 / 7 / 10 years) with increasing / decreasing / staying-the-same badges.

## Files

| File | Role |
|------|------|
| `index.html` | Dashboard UI |
| `overlays.json` | Per-CCN curated series (IJ, HCRIS staff, traveler estimates) |
| `charts.json` / `data.json` | Legacy Mission snapshots (refresh still updates these) |
| `refresh.mjs` | CMS snapshot refresh for Mission JSON |
| `vendor/chart.umd.js` | Chart.js |

## Notes

- Staff-to-bed uses CMS HCRIS S-3 Part I line 14 (FTEs ÷ beds). FY2019–FY2020 filled from HOSP10FY zips for CCN 340002.
- Travel nurse card plots Watchdog headcounts; % of nursing staff and total nurses shown when a published denominator exists (Dec 2025 ≈ 26% of ~2,027). Earlier points show count only.
- Trend window changes re-render from the last loaded snapshot (no CMS re-fetch) so overlapping loads cannot blank charts. If fewer than N years exist, available years are shown with a note.
- Top vs low rating **ratio** = (% 9–10) ÷ (% ≤6); national from CMS dataset `99ue-w85f`. Shown as a current snapshot (CMS does not publish a long public 9–10/≤6 history); year-over-year trend is on the HCAHPS stars card.
