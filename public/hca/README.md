# HCA / Mission Hospital Dashboard

Static news/talking-points dashboard for Reclaim Healthcare WNC.

- **Live URL:** https://parigrado.com/hca/
- **HTML path:** `public/hca/index.html`
- **Hosting:** Parigrado / Render (not GitHub Pages)
- **Refresh workflow:** `.github/workflows/update-dashboard.yml` (runs `scripts/update-dashboard.js` via Anthropic)
- **Legacy URL:** `/hca-watchdog/` redirects to `/hca/`

## Source universe (daily checks)

Outlets from articles on the dashboard are stored in `scripts/hca-sources.json` and fed into each weekday morning refresh.

After you **manually add** a news card to `public/hca/index.html`, run:

```bash
npm run sync:hca-sources
```

That adds the article’s source/host to the persistent universe. The daily `update:hca` job also syncs automatically before and after each refresh.

Daily morning digest email (Resend) was discontinued.
