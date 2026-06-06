# Analytics & Monitoring — Setup Checklist

Wiring is already in the code. This is the "go get the keys and flip it on" checklist.
Until you complete it, both tools stay dormant (Sentry inert with no DSN, Vercel
Analytics no-ops off Vercel) — so nothing breaks if you skip it.

---

## 1. Sentry (error + performance monitoring)

### What you need
| Env var | Where it goes | Required? | Secret? |
|---------|---------------|-----------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | `.env` (local) + Vercel | **Yes** — without it Sentry sends nothing | No (public by design) |
| `NEXT_PUBLIC_SENTRY_ENV` | `.env` + Vercel | Optional (defaults to `NODE_ENV`) | No |
| `SENTRY_ORG` | Vercel / CI only | Only for source-map upload | No |
| `SENTRY_PROJECT` | Vercel / CI only | Only for source-map upload | No |
| `SENTRY_AUTH_TOKEN` | Vercel / CI only | Only for source-map upload | **Yes — keep secret** |

### Steps
- [ ] Create a Sentry account → https://sentry.io (free "Developer" tier is fine to start).
- [ ] **Create a project**: *Projects → Create Project → Platform: Next.js*. Name it e.g. `meethril`.
- [ ] **Grab the DSN**: *Settings → Projects → [your project] → Client Keys (DSN)*. Copy the `https://…@…ingest.sentry.io/…` value.
      → set as `NEXT_PUBLIC_SENTRY_DSN`.
- [ ] Note your **org slug** and **project slug** (visible in the URL `sentry.io/organizations/<org>/projects/<project>/`).
      → `SENTRY_ORG` and `SENTRY_PROJECT`.
- [ ] **Create an auth token for source maps**: *Settings → Auth Tokens → Create New Token*. Scopes needed: `project:releases` (and `org:read`). Use the **organization** auth token, not a personal one, for CI.
      → set as `SENTRY_AUTH_TOKEN` (Vercel/CI only — never commit it).
- [ ] Add all of the above in **Vercel → Project → Settings → Environment Variables** (Production + Preview).
- [ ] Add `NEXT_PUBLIC_SENTRY_DSN` to your **local `.env`** if you want to test error capture in dev.
- [ ] **Verify**: deploy (or run prod build), then trigger a test error and confirm it lands in the Sentry dashboard.
      Quick test — temporarily add `throw new Error("sentry test")` in a page, load it, then remove it.

### Privacy notes (already enforced in code — don't undo)
- `sendDefaultPii: false`, **no Session Replay**, and `beforeSend` scrubs request bodies/cookies/headers/email/IP.
- If you later enable any Sentry feature, do **not** turn on Session Replay — it records the decrypted journal on screen.

---

## 2. Vercel Analytics + Speed Insights (traffic + Web Vitals)

### What you need
**No keys, no env vars.** It authenticates via the Vercel project itself. You only flip dashboard toggles.

### Steps
- [ ] Make sure the app is deployed to **Vercel** (these only collect on Vercel hosting).
- [ ] **Enable Analytics**: *Vercel → Project → Analytics tab → Enable*.
- [ ] **Enable Speed Insights**: *Vercel → Project → Speed Insights tab → Enable*.
- [ ] Redeploy if Vercel prompts you to.
- [ ] **Verify**: open the deployed site in a browser, click around, then check the Analytics tab for pageviews
      (allow a few minutes for data to appear).

### Notes
- Cookieless and privacy-friendly — fine to mention on the privacy page.
- Free (Hobby) tier includes a capped number of events/month; upgrade only if you outgrow it.
- Locally / in Docker these components render nothing and make no network calls.

---

## Quick reference — where each value comes from

```
NEXT_PUBLIC_SENTRY_DSN   → Sentry → Settings → Client Keys (DSN)
NEXT_PUBLIC_SENTRY_ENV   → you choose: production | preview | development
SENTRY_ORG               → Sentry org slug (from dashboard URL)
SENTRY_PROJECT           → Sentry project slug (from dashboard URL)
SENTRY_AUTH_TOKEN        → Sentry → Settings → Auth Tokens → Create New Token
Vercel Analytics         → no key; Vercel dashboard → Analytics → Enable
Vercel Speed Insights    → no key; Vercel dashboard → Speed Insights → Enable
```
