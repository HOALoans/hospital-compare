# Mission Hospital — Road to Recovery (unlisted)

Link-only care-integrity dashboard for Mission Hospital (Asheville, CCN 340002).

**URL (after deploy):** https://parigrado.com/mission-tracker/

Not linked from Parigrado navigation. Served as static files from `public/mission-tracker/`. Includes `noindex` and is disallowed in `public/robots.txt`.

## Files

| File | Role |
|------|------|
| `index.html` | Dashboard UI |
| `charts.json` | Chart-ready data loaded by the page |
| `data.json` | Richer CMS/source notes |
| `refresh.mjs` | Pulls latest CMS snapshots into `charts.json` |
| `vendor/chart.umd.js` | Chart.js |

## Refresh

```bash
# from hospital-compare repo root
npm run refresh:mission-tracker
```

GitHub Actions runs this weekly (`.github/workflows/mission-tracker-refresh.yml`) and commits changes when CMS data moves.
