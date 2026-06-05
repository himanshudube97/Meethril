# Desktop notifications parity (macOS) — design

**Date:** 2026-06-06
**Branch:** feat/desktop-notifications (off main `e741474`)
**Status:** Approved, ready for implementation plan

## Problem

The web app sends notifications; the desktop (Tauri) app does not — at least not
in a way that survives the app being closed. The existing
`feat/desktop-fullscreen-notifications` branch (179 commits behind main) added a
JS `setTimeout` scheduler that runs only while the app window is open, which
fundamentally cannot fire when the app is closed. We want the desktop app to
reach **parity with the app's current notifications** — the **daily reminder**
("come write something") and **letter arrived** — and to fire **even when the
app is fully closed**.

## Goal & non-goals

**Goal:** When a user runs the macOS desktop build, they receive native OS
notifications for (a) the daily journaling reminder and (b) a time-delayed
letter arriving, even if the app is quit, and consistent with their server-side
settings. Every device the user has notifies independently ("notify every
device").

**Non-goals (v1):**
- Windows / Linux delivery (follow-up via Task Scheduler, behind the same
  abstraction).
- Native push (APNs). Explicitly rejected — needs an Apple Developer account
  ($99/yr) + device tokens on the server; against the app's local-first ethos.
- Cross-device dedup / "single active device" (the user chose notify-every-device).
- Changing the web letter-arrival experience (stays email + in-app banner).

## Key decisions (from brainstorm)

1. **Notify every device** — web browsers and the desktop app all notify
   independently. No silencing logic.
2. **Desktop delivery = macOS `launchd`** local scheduler (not push, not tray).
   Fires when fully quit and survives reboot (LaunchAgents load at login).
3. **Smart notifier** — at fire time it checks the server (token in the macOS
   keychain) and only shows what's actually due/unread; auto-syncs to settings
   changed on other surfaces.
4. **Parity scope** — desktop fires for **daily reminder + letter arrived** (the
   two notification types the app has today), via one poll, extensible to future
   types.

## Architecture

Server stays the single source of truth. Two delivery channels; the desktop one
is *pull*, the web one is unchanged.

```
              ┌──────────── server (source of truth) ───────────────┐
              │ reminder time · enabled · tz · journaledToday        │
              │ delivered-but-unviewed letters                       │
              └──────▲───────────────────────────────▲──────────────┘
   web-push (push →) │                               │ (← pull) HTTPS + keychain token
        ┌────────────┴───────────┐         ┌─────────┴───────────────────────┐
        │ Web browsers (Chrome)   │         │ Desktop app (macOS)              │
        │ · reminder: web-push    │         │ launchd job (~30 min, headless)  │
        │ · letter: email+banner  │         │ → /api/me/desktop-pending        │
        └─────────────────────────┘         │ → native notif for reminder+letter│
                                            └──────────────────────────────────┘
```

### Notification types vs channels

| | Daily reminder | Letter arrived |
|---|---|---|
| **Web** | web-push to every subscription | email + in-app banner *(unchanged)* |
| **Desktop** | launchd poll → native notif | launchd poll → native notif *(new)* |

## Components

### 1. Web change — "notify every browser" (small)
- **`POST /api/push/subscribe`**: remove the `deleteMany({ NOT: { endpoint } })`
  wipe so each browser persists as its own row. Keep the `upsert` by endpoint
  (re-subscribing the same browser just refreshes it).
- **`GET /api/cron/send-reminders`**: already loops all subscriptions; add
  pruning — when `webpush.sendNotification` throws `410 Gone`/`404`, delete that
  subscription row (replaces the pre-emptive wipe as the dead-endpoint cleanup).
- No other web change. Letter-arrival on web is untouched (email + banner).

### 2. New server endpoint — `GET /api/me/desktop-pending`
Thin, auth'd (Bearer token — see §6), reuses existing logic. Reads `X-User-TZ`
for the device's timezone (same pattern as `/api/me/reminder-status`).

Response:
```jsonc
{
  "reminder": { "due": true, "title": "meethril", "body": "<a reminder line>" } | null,
  "letters":  [ { "id": "<letterId>", "title": "a letter arrived ✨", "body": "from past you" } ]
}
```
- `reminder.due` = `enabled && nowInTz >= reminderTime(today) && !journaledToday`.
  Reuses `reminder-schedule` + `reminder-messages` helpers (DRY with the cron).
- `letters` = delivered-but-unviewed letters — the same query backing
  `/api/letters/arrived`. (Returns minimal display fields only; no ciphertext.)
- Stateless per device: it reports what is *currently* due/unread. Dedup ("did I
  already fire today / already alert this letter") is the client's job (§4),
  so the server keeps no per-device fired state.

### 3. macOS launchd agent (Rust/Tauri side)
- Plist path: `~/Library/LaunchAgents/app.hearth.desktop.reminder.plist`
  (label derived from the app bundle id `app.hearth.desktop`).
- `ProgramArguments`: `<app bundle>/Contents/MacOS/meethril --remind-check`.
- `StartInterval`: 1800 (30 min). `StartInterval` fires on a wall-clock cadence
  and catches up after sleep — good enough for a daily reminder and a months-old
  letter (latency ≤30 min, nothing here is time-critical).
- Tauri commands callable from the web UI when `isTauri()`:
  - `install_reminder_agent()` — write the plist + `launchctl bootstrap`/`load`.
  - `remove_reminder_agent()` — `launchctl bootout`/`unload` + delete the plist.
- Called on reminder enable/disable and on app launch (to self-heal if missing).

### 4. Headless notifier — app binary `--remind-check`
In Rust `main()`, if `--remind-check` is present, run a **pure-Rust** path and
exit **before building any Tauri window** (no webview spins up):
1. Read auth token from the macOS keychain (`keyring` crate).
2. `GET /api/me/desktop-pending` with `Authorization: Bearer <token>` and
   `X-User-TZ: <device tz>` (via `reqwest`). On success, cache the response to
   `~/Library/Application Support/<app>/notif-cache.json`.
3. Load local state `~/Library/Application Support/<app>/notif-state.json`:
   `{ reminderFiredDate: "YYYY-MM-DD", shownLetterIds: [..] }`.
4. **Reminder**: if `reminder.due` && `reminderFiredDate != today` → show native
   notification (`tauri-plugin-notification` / `mac-notification-sys`); set
   `reminderFiredDate = today`.
5. **Letters**: for each `letters[].id` not in `shownLetterIds` → show native
   notification; append the id to `shownLetterIds`.
6. Dock badge = (reminder pending ? 1 : 0) + (new letters count). (Badge cleared
   on window focus — existing behavior to port.)
7. Persist updated state.

**Offline / auth-failure fallbacks:**
- Network error → use `notif-cache.json`: the reminder can still fire from cached
  `enabled`+`time` (best-effort — better a stray reminder than a missed one);
  letters are skipped (can't confirm arrivals offline).
- Token missing/expired (401) → attempt refresh (§6); if still failing, fire the
  reminder best-effort within the window, skip letters. App rewrites a fresh
  token on next launch.

### 5. Token bridge to keychain
- While the app is open, on launch and on auth/token refresh, the web layer
  (when `isTauri()`) calls a Tauri command `save_auth_token(token)` that stores
  the session token in the macOS keychain.
- Dev auth: the `hearth-auth-token` JWT. Production: the Supabase access token
  (+ refresh token, to allow §6 refresh).

### 6. Auth from the headless notifier (the main risk — prototype first)
The notifier is a separate process with no cookies. It must authenticate to
`/api/me/desktop-pending`:
- **Dev (`USE_DEV_AUTH`)**: send the stored dev JWT as `Authorization: Bearer`.
  Add Bearer acceptance to this one endpoint's auth path.
- **Production (Supabase)**: store the access + refresh token in keychain. The
  notifier sends the access token as Bearer; on 401 it refreshes via Supabase's
  token endpoint using the refresh token, updates the keychain, and retries.
- `getCurrentUser()` / the endpoint's auth must accept a Bearer token in addition
  to the cookie. Scope this to `/api/me/desktop-pending` to avoid widening auth
  elsewhere.
- **This is the first thing to prototype** — if Bearer auth proves impractical,
  reconsider before building the rest.

### 7. Remove the stale in-app scheduler
- Do **not** port `useDesktopReminderScheduler` (the JS `setTimeout`). launchd is
  the single delivery path (works open or closed) and avoids double-firing when
  the app happens to be open.
- Keep the dock-badge-clear-on-focus behavior.

## Case matrix (all covered)

| Case | Resolution |
|---|---|
| Web only | web-push to every browser subscription ✓ |
| Desktop only | launchd notifier fires when fully quit ✓ |
| Web + desktop | both notify (every device). Same machine w/ Chrome+app = 2 notifs (accepted) |
| Set time / disable on web | desktop reads server next poll (≤30 min) → new time / stops ✓ |
| Journaled on web | `desktop-pending.reminder.due=false` → desktop silent (web cron also skips) ✓ |
| Read a letter on web | letter drops off `/arrived` → not returned → desktop won't (re)alert ✓ |
| Multiple machines | each notifies independently ✓ |
| Timezone differs | reminder = "HH:MM in the device's local tz", via `X-User-TZ` ✓ |
| Permission | macOS notification permission requested on first enable; web is separate ✓ |
| Reboot | LaunchAgent reloads at login → keeps firing ✓ |
| Offline at fire time | cached status fires reminder best-effort; letters deferred ✓ |

## Error handling summary
- Push 410/404 on web → prune that subscription.
- launchd program path missing (app uninstalled) → launchd no-ops/logs; optional
  self-removal if bundle absent.
- Notifier network/auth failure → cached/best-effort per §4/§6.
- Double-fire (in-app vs launchd) → eliminated by removing the in-app scheduler.

## Testing
- **Fast loop:** run the notifier directly — `…/meethril --remind-check` — from a
  terminal with reminders enabled and time set ~1 min in the past; confirm a
  native notification appears without opening the app.
- **Closed-app:** set reminder ~2 min ahead, **quit the app**, confirm launchd
  fires the notification.
- **Suppression:** journal an entry, run `--remind-check`, confirm no reminder.
- **Letters:** seal a self-letter due now (or flip `deliveredAt`), run
  `--remind-check`, confirm "letter arrived" notif; run again → not repeated.
- **Sync:** change reminder time on web while app closed; next poll uses new time.
- **Disable:** toggle reminders off → agent removed → no further notifications.

## Build order (informs the plan)
1. Prototype **Bearer auth** + `GET /api/me/desktop-pending` (the risk).
2. Keychain token bridge (`save_auth_token`).
3. Headless `--remind-check` Rust path (reminder only) + local state.
4. launchd install/remove commands + wire to enable/disable + app-launch self-heal.
5. Add letters to the notifier + `desktop-pending`.
6. Web multi-subscription change + 410 pruning.
7. Remove the in-app scheduler; keep badge-clear-on-focus.
8. Manual test matrix above.

## Open follow-ups (out of scope v1)
- Windows (Task Scheduler) + Linux behind the same install/notify abstraction.
- A general server-side "pending notifications" queue if more event types appear
  (stranger replies, birthdays) — `desktop-pending` is the seam to grow into it.
