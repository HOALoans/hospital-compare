# HCA / Mission Hospital Dashboard

Static news/talking-points dashboard for Reclaim Healthcare WNC.

- **Live URL:** https://parigrado.com/hca/
- **HTML path:** `public/hca/index.html`
- **Hosting:** Parigrado / Render (not GitHub Pages)
- **Refresh workflow:** `.github/workflows/update-dashboard.yml` (runs `scripts/update-dashboard.js` via Anthropic)
- **Legacy URL:** `/hca-watchdog/` redirects to `/hca/`

## Morning email digest

Weekday mornings (same cron as the dashboard update, ~7am ET) the workflow runs `scripts/send-morning-digest.js` after the update. It emails headlines dated **today or yesterday** (America/New_York) from advocacy + financial news on the dashboard, plus a link to https://parigrado.com/hca/. If there are no matching headlines, it skips sending.

### Required GitHub Actions secrets

| Secret | Purpose |
|--------|---------|
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) (free tier is fine) |
| `DIGEST_FROM` | Verified From address, e.g. `HCA Dashboard <digest@yourdomain.com>` |

### Optional

| Secret / env | Purpose |
|--------------|---------|
| `DIGEST_TO` | Recipient override (default hard-coded: `LarryRkirschner@gmail.com`) |

Until `RESEND_API_KEY` and `DIGEST_FROM` are set, the digest step exits cleanly without sending (dashboard update still succeeds). Once secrets are set, send failures fail the workflow step. Local dry run:

```bash
DIGEST_DRY_RUN=1 node scripts/send-morning-digest.js
```
