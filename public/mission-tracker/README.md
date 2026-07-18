# Hospital Health Dashboard (unlisted)

Link-only hospital quality/safety dashboard on Parigrado.

**URL:** https://parigrado.com/mission-tracker/?ccn=340002

Not in main navigation. `noindex` + disallowed in `public/robots.txt`.

## What it does

- Load **any hospital** by CCN or name search (uses Parigrado `/api/hospitals/*` when available, otherwise CMS APIs).
- CMS Care Compare: HCAHPS stars, overall rating, HAIs, mortality, complications, readmissions, patient rating mix (9–10 vs ≤6) with **national** comparison.
- Optional **overlays** (Immediate Jeopardy, staff-to-bed, travelers) from `overlays.json` when curated for that CCN (Mission `340002` included).
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

- FY2019–FY2020 staff-to-bed are charted as gaps until HCRIS rows are loaded.
- Traveler 2023 has no published single % — year is shown with a gap.
- Patient rating **ratio** = (% 9–10) ÷ (% ≤6); national from CMS dataset `99ue-w85f`. Long history of the 9–10/≤6 split is limited in archives, so the trend badge uses HCAHPS summary stars.
