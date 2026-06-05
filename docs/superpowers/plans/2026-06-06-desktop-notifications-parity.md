# Desktop Notifications Parity (macOS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A macOS desktop (Tauri) build fires native OS notifications for the daily reminder and for arrived letters — even when the app is fully closed — driven by a `launchd` agent that pulls from the server, with settings consistent across web and desktop.

**Architecture:** Server stays the source of truth. The desktop registers a macOS `launchd` agent that runs the app binary headless (`--remind-check`) every ~30 min; it authenticates with a dedicated scoped "desktop token" stored in the macOS keychain, calls a new `GET /api/me/desktop-pending`, and shows native notifications for whatever's due, deduping via a small local state file. Web reminders gain multi-device support (every browser notifies).

**Tech Stack:** Next.js 16 / TS (server + web), Prisma, Tauri 2 / Rust (`keyring`, `reqwest`, `tauri-plugin-notification`), macOS `launchd` + `launchctl`.

**Convention:** Per Meethril practice, **no formal unit-test suite** — verify each task manually (commands given). A few server checks use `curl`. Docker for the web/API (`docker compose ... app`, served at http://localhost:3112). The Tauri app builds natively on macOS (`cargo`, `tauri-cli 2.11` present).

**Branch:** `feat/desktop-notifications` (already created off `main`).

---

## File map

**Server / web (TypeScript):**
- Create `src/lib/desktop-token.ts` — mint/verify the scoped desktop token (HS256 JWT via existing `jose`/dev-auth pattern).
- Create `src/app/api/me/desktop-token/route.ts` — `POST` mints a token (normal auth).
- Create `src/app/api/me/desktop-pending/route.ts` — `GET`, Bearer-authed, returns due reminder + arrived letters.
- Create `src/lib/reminder-target.ts` — shared "reminder target time for today" + "is now at/after target" helper (DRY with the cron's slot logic).
- Modify `src/app/api/me/profile-flags/route.ts` — allow `remindersEnabled`.
- Modify `src/hooks/useReminders.ts` — set `remindersEnabled` true/false on subscribe/unsubscribe.
- Modify `src/app/api/push/subscribe/route.ts` — stop wiping other subscriptions.

**Desktop (Rust / Tauri) — `src-tauri/`:**
- Modify `Cargo.toml` — add `tauri-plugin-notification`, `keyring`, `reqwest`, `chrono`, `dirs`.
- Modify `src/lib.rs` — notification/badge commands (ported), `--remind-check` headless path, keychain + launchd Tauri commands.
- Create `src/remind_check.rs` — the headless notifier logic.
- Create `src/launchd.rs` — install/remove the LaunchAgent plist.
- Modify `capabilities/default.json` — notification capability.

**Web↔desktop glue (TypeScript):**
- Create `src/lib/desktop/isTauri.ts` — runtime check (port from old branch).
- Create `src/lib/desktop/reminders.ts` — `enableDesktopReminders()` / `disableDesktopReminders()` calling the Tauri commands when `isTauri()`.
- Modify the reminders UI hook/control to call those on toggle.

---

## Task 1: Spike — scoped desktop token (mint + verify) end-to-end

Prove the riskiest piece (auth from a tokenless background process) before any Rust.

**Files:**
- Create: `src/lib/desktop-token.ts`
- Create: `src/app/api/me/desktop-token/route.ts`
- Reference: `src/lib/auth/dev-auth.ts` (existing JWT signing pattern), `src/lib/auth/config.ts`

- [ ] **Step 1: Inspect the existing JWT helper to reuse its secret + lib**

Run: `sed -n '1,60p' src/lib/auth/dev-auth.ts && grep -n "SECRET\|jose\|SignJWT\|jwtVerify" src/lib/auth/dev-auth.ts`
Expected: see how dev tokens are signed (likely `jose` `SignJWT`/`jwtVerify` with a server secret). Reuse the same `jose` lib. Use `process.env.DESKTOP_TOKEN_SECRET` if set, else fall back to the dev/JWT secret already in use, so dev works with no new env.

- [ ] **Step 2: Implement `desktop-token.ts`**

```ts
// src/lib/desktop-token.ts
import { SignJWT, jwtVerify } from 'jose'

// A long-lived, narrowly-scoped token the desktop app stores in the macOS
// keychain so its headless reminder process can read /api/me/desktop-pending.
// It can do nothing else (scope check enforced at the endpoint).
const SCOPE = 'desktop-pending'
const TTL = '180d'

function secret(): Uint8Array {
  const s = process.env.DESKTOP_TOKEN_SECRET || process.env.DEV_JWT_SECRET
  if (!s || s.length < 32) throw new Error('DESKTOP_TOKEN_SECRET (or DEV_JWT_SECRET) missing/too short')
  return new TextEncoder().encode(s)
}

export async function mintDesktopToken(userId: string): Promise<string> {
  return new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret())
}

export async function verifyDesktopToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.scope !== SCOPE || typeof payload.sub !== 'string') return null
    return { userId: payload.sub }
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Implement the mint route (normal session auth)**

```ts
// src/app/api/me/desktop-token/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { mintDesktopToken } from '@/lib/desktop-token'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = await mintDesktopToken(user.id)
  return NextResponse.json({ token })
}
```

- [ ] **Step 4: Verify mint works (authenticated dev session)**

Restart: `docker compose restart app`. In the browser dev console while logged in at http://localhost:3112:
```js
await fetch('/api/me/desktop-token', { method: 'POST' }).then(r => r.json())
```
Expected: `{ token: "<jwt>" }`. Copy the token for the next step.

- [ ] **Step 5: Verify the token validates out-of-band (the spike's whole point)**

Run (paste the token):
```bash
docker compose exec -T app node -e '
const { verifyDesktopToken } = require("./src/lib/desktop-token.ts");
' 2>/dev/null || echo "use the endpoint test below instead"
```
If the inline require fails (TS), instead validate via the Task-3 endpoint once it exists. For now, confirm the JWT decodes: paste the token at the `Bearer` test in Task 3 Step 4. **Spike success criterion:** a token minted by the browser session authenticates a plain `curl` with no cookies. If this fails, STOP and reconsider auth before building Rust.

- [ ] **Step 6: Commit**

```bash
git add src/lib/desktop-token.ts src/app/api/me/desktop-token/route.ts
git commit -m "feat(desktop): scoped desktop token mint + verify"
```

---

## Task 2: `remindersEnabled` flag + web wiring

Give the server a cross-surface "reminders on" signal the desktop can read.

**Files:**
- Modify: `src/app/api/me/profile-flags/route.ts:5-9` (ALLOWED_KEYS)
- Modify: `src/hooks/useReminders.ts` (subscribe/unsubscribe)

- [ ] **Step 1: Allow the new profile key**

In `profile-flags/route.ts`, extend `ALLOWED_KEYS`:

```ts
const ALLOWED_KEYS = new Set([
  'reminderTime',
  'reminderOptInPromptShownAt',
  'lastComebackShownAt',
  'remindersEnabled',
])
```

- [ ] **Step 2: Set it on web subscribe/unsubscribe**

In `src/hooks/useReminders.ts`, find `subscribe()` and `unsubscribe()`. After a successful subscribe, and after unsubscribe, PATCH the flag. Add a helper near the existing `setReminderTime` PATCH (which already posts to `/api/me/profile-flags`):

```ts
async function setRemindersEnabled(enabled: boolean): Promise<void> {
  await fetch('/api/me/profile-flags', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remindersEnabled: enabled }),
  }).catch(() => {})
}
```
Call `await setRemindersEnabled(true)` at the end of a successful `subscribe()` (before returning `{ ok: true }`), and `await setRemindersEnabled(false)` inside `unsubscribe()`.

- [ ] **Step 3: Verify**

Restart. In the browser console while logged in:
```js
await fetch('/api/me/profile-flags', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remindersEnabled: true }) }).then(r=>r.json())
await fetch('/api/me/profile-flags').then(r=>r.json())
```
Expected: the GET shows `profile.remindersEnabled === true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/me/profile-flags/route.ts src/hooks/useReminders.ts
git commit -m "feat(reminders): server-side remindersEnabled flag + web wiring"
```

---

## Task 3: `GET /api/me/desktop-pending` (reminder only, letters added in Task 7)

**Files:**
- Create: `src/lib/reminder-target.ts`
- Create: `src/app/api/me/desktop-pending/route.ts`
- Reference: `src/lib/reminder-schedule.ts`, `src/app/api/cron/send-reminders/route.ts` (tz/day helpers), `src/lib/reminder-messages.ts`, `src/lib/encryption.ts`

- [ ] **Step 1: Shared "is now at/after the reminder target" helper**

The cron uses a 15-min *slot match*; the desktop polls every 30 min, so it must fire on "now ≥ target today" instead (dedup is local). Reuse `targetMinutesPastSeven` for the target, and add a local-time comparator.

```ts
// src/lib/reminder-target.ts
import { targetMinutesPastSeven } from './reminder-schedule'

const WINDOW_START_HOUR = 19 // matches reminder-schedule's 7pm anchor

// Wall-clock "HH:MM" string for the user's reminder target today, given their
// stored reminderTime ("HH:MM" or null => deterministic default slot).
export function targetTimeHHMM(args: { userId: string; dateStr: string; reminderTime: string | null }): string {
  const minsPastSeven = args.reminderTime
    ? targetMinutesPastSeven({ mode: 'override', time: args.reminderTime })
    : targetMinutesPastSeven({ mode: 'default', userId: args.userId, dateStr: args.dateStr })
  const totalMin = WINDOW_START_HOUR * 60 + minsPastSeven
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// True if nowLocalISO ('YYYY-MM-DDTHH:MM:..') is at/after target HH:MM today.
export function isAtOrAfterTarget(nowLocalISO: string, targetHHMM: string): boolean {
  const m = nowLocalISO.match(/T(\d{2}):(\d{2})/)
  if (!m) return false
  const nowMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const [th, tm] = targetHHMM.split(':').map(n => parseInt(n, 10))
  return nowMin >= th * 60 + tm
}
```

- [ ] **Step 2: Implement the endpoint (Bearer-authed, reminder only)**

Copy the tz/day helpers (`localWallClockISO`, `localDateStr`, `startOfLocalDayUTC`) — they already exist in `send-reminders/route.ts`; to avoid duplication, **extract them** into `src/lib/tz.ts` and import from both. (Do the extraction here: cut the three functions from the cron, paste into `src/lib/tz.ts` with `export`, and import them back in the cron.)

```ts
// src/app/api/me/desktop-pending/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decryptJson } from '@/lib/encryption'
import { verifyDesktopToken } from '@/lib/desktop-token'
import { localWallClockISO, localDateStr, startOfLocalDayUTC } from '@/lib/tz'
import { targetTimeHHMM, isAtOrAfterTarget } from '@/lib/reminder-target'
import { pickReminderLine, REMINDER_TITLE } from '@/lib/reminder-messages'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const verified = await verifyDesktopToken(token)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tz = request.headers.get('x-user-tz') || 'UTC'
  const now = new Date()
  const dateStr = localDateStr(now, tz)
  const startOfToday = startOfLocalDayUTC(now, tz)

  const dbUser = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { profile: true },
  })
  const profile = dbUser?.profile
    ? (decryptJson<Record<string, unknown>>(dbUser.profile as string) ?? {})
    : {}

  const enabled = profile.remindersEnabled === true
  const reminderTime = typeof profile.reminderTime === 'string' ? profile.reminderTime : null

  // journaled today?
  const latest = await prisma.journalEntry.findFirst({
    where: { userId: verified.userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const journaledToday = Boolean(latest && latest.createdAt >= startOfToday)

  let reminder: { due: boolean; title: string; body: string } | null = null
  if (enabled) {
    const targetHHMM = targetTimeHHMM({ userId: verified.userId, dateStr, reminderTime })
    const due = isAtOrAfterTarget(localWallClockISO(now, tz), targetHHMM) && !journaledToday
    reminder = { due, title: REMINDER_TITLE, body: pickReminderLine() }
  }

  return NextResponse.json({ reminder, letters: [] }) // letters filled in Task 7
}
```

- [ ] **Step 3: Verify the tz extraction didn't break the cron**

Run: `docker compose exec -T app npx tsc --noEmit`
Expected: exit 0 (cron now imports from `@/lib/tz`).

- [ ] **Step 4: Verify the endpoint with the spiked token (no cookies)**

Set `remindersEnabled:true` and `reminderTime` to a minute in the past (browser console), grab a desktop token, then:
```bash
TOKEN='<paste desktop token>'
curl -s http://localhost:3112/api/me/desktop-pending \
  -H "Authorization: Bearer $TOKEN" -H "X-User-TZ: $(date +%Z)" | jq
```
Expected: `{ "reminder": { "due": true, "title": "meethril", "body": "..." }, "letters": [] }`. Then journal an entry and re-run → `due: false`. **This is the Task-1 spike's real confirmation.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminder-target.ts src/lib/tz.ts src/app/api/me/desktop-pending/route.ts src/app/api/cron/send-reminders/route.ts
git commit -m "feat(desktop): desktop-pending endpoint (reminder) + tz extraction"
```

---

## Task 4: Web — notify every browser (drop the subscription wipe)

**Files:**
- Modify: `src/app/api/push/subscribe/route.ts:20-32`

- [ ] **Step 1: Remove the deleteMany-others wipe**

Replace the transaction that does `deleteMany({ NOT: { endpoint } })` + `upsert` with just the `upsert` (keep per-endpoint upsert so re-subscribing the same browser refreshes; other browsers persist):

```ts
await prisma.pushSubscription.upsert({
  where: { endpoint },
  create: { userId: user.id, endpoint, p256dh, auth, userAgent, tz },
  update: { userId: user.id, p256dh, auth, userAgent, tz },
})
```
Dead-endpoint cleanup already happens in the cron on `410/404` (verified in `send-reminders`), so the pre-emptive wipe is no longer needed.

- [ ] **Step 2: Verify**

Run: `docker compose exec -T app npx tsc --noEmit` → exit 0. Then in the browser, re-subscribe and confirm it still returns ok:
```js
// (re-trigger your reminders opt-in UI, or hit the subscribe flow)
```
Manual DB sanity (optional): `docker compose exec app npx prisma studio` → `PushSubscription` table keeps multiple rows for one user across different browsers.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/push/subscribe/route.ts
git commit -m "feat(reminders): keep all browser subscriptions (notify every device)"
```

---

## Task 5: Tauri — notification commands + headless `--remind-check` (reminder only)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/remind_check.rs`
- Modify: `src-tauri/capabilities/default.json`
- Reference (port from): `git show feat/desktop-fullscreen-notifications:src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust deps**

In `src-tauri/Cargo.toml` `[dependencies]`, add:
```toml
tauri-plugin-notification = "2"
keyring = "3"
reqwest = { version = "0.12", features = ["blocking", "json", "rustls-tls"] }
chrono = "0.4"
chrono-tz = "0.10"
dirs = "5"
```

- [ ] **Step 2: Port notification + badge commands into `lib.rs`**

Bring over `show_notification`, `set_badge`, `clear_badge`, the `tauri_plugin_notification::init()` plugin registration, and the focus→clear-badge `on_window_event` exactly as in the old branch (`git show feat/desktop-fullscreen-notifications:src-tauri/src/lib.rs`). Register them in `invoke_handler`.

- [ ] **Step 3: Headless `--remind-check` entry — short-circuit before the window**

At the very top of `pub fn run()` in `lib.rs`, before `tauri::Builder`:

```rust
if std::env::args().any(|a| a == "--remind-check") {
    crate::remind_check::run_remind_check();
    return;
}
```
Add `mod remind_check;` to `lib.rs`.

- [ ] **Step 4: Implement the notifier (`remind_check.rs`)**

Pure Rust; no Tauri window. Reads keychain token, calls the endpoint, shows a notification via `notify-rust` (pull in `notify-rust = "4"` rather than the Tauri plugin here, since there's no AppHandle in headless mode). Add `notify-rust = "4"` to Cargo.toml.

```rust
// src-tauri/src/remind_check.rs
use serde::Deserialize;

const KEYRING_SERVICE: &str = "app.hearth.desktop"; // keychain service (bundle id)
const KEYRING_USER: &str = "desktop-token";

#[derive(Deserialize)]
struct Pending {
    reminder: Option<Reminder>,
    #[serde(default)]
    letters: Vec<Letter>,
}
#[derive(Deserialize)]
struct Reminder { due: bool, title: String, body: String }
#[derive(Deserialize)]
struct Letter { id: String, title: String, body: String }

fn base_url() -> String {
    std::env::var("MEETHRIL_BASE_URL").unwrap_or_else(|_| "http://localhost:3112".into())
}

fn device_tz() -> String {
    iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".into())
}

pub fn run_remind_check() {
    let token = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).and_then(|e| e.get_password()) {
        Ok(t) => t,
        Err(_) => return, // not enrolled / no token -> nothing to do
    };

    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(format!("{}/api/me/desktop-pending", base_url()))
        .bearer_auth(&token)
        .header("X-User-TZ", device_tz())
        .timeout(std::time::Duration::from_secs(10))
        .send();

    let pending: Pending = match resp.and_then(|r| r.error_for_status()).and_then(|r| r.json()) {
        Ok(p) => p,
        Err(_) => return, // offline/auth fail: Task 7 adds cached fallback
    };

    let mut state = crate::remind_check::state::load();

    if let Some(r) = pending.reminder {
        if r.due && !state.reminder_fired_today() {
            notify(&r.title, &r.body);
            state.mark_reminder_fired();
        }
    }
    for l in &pending.letters {
        if !state.letter_shown(&l.id) {
            notify(&l.title, &l.body);
            state.mark_letter_shown(&l.id);
        }
    }
    state.save();
}

fn notify(title: &str, body: &str) {
    let _ = notify_rust::Notification::new().summary(title).body(body).show();
}
```
Add `iana-time-zone = "0.1"` to Cargo.toml for `device_tz()`. Implement the `state` submodule (next step).

- [ ] **Step 5: Local dedup state**

```rust
// in remind_check.rs
pub mod state {
    use serde::{Deserialize, Serialize};
    use std::path::PathBuf;

    #[derive(Default, Serialize, Deserialize)]
    pub struct State {
        pub reminder_fired_date: String, // "YYYY-MM-DD" in device-local time
        pub shown_letter_ids: Vec<String>,
    }
    fn path() -> PathBuf {
        let mut p = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
        p.push("app.hearth.desktop");
        let _ = std::fs::create_dir_all(&p);
        p.push("notif-state.json");
        p
    }
    fn today() -> String {
        use chrono::Local;
        Local::now().format("%Y-%m-%d").to_string()
    }
    pub fn load() -> State {
        std::fs::read_to_string(path()).ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    impl State {
        pub fn reminder_fired_today(&self) -> bool { self.reminder_fired_date == today() }
        pub fn mark_reminder_fired(&mut self) { self.reminder_fired_date = today(); }
        pub fn letter_shown(&self, id: &str) -> bool { self.shown_letter_ids.iter().any(|x| x == id) }
        pub fn mark_letter_shown(&mut self, id: &str) { self.shown_letter_ids.push(id.to_string()); }
        pub fn save(&self) { let _ = std::fs::write(path(), serde_json::to_string(self).unwrap_or_default()); }
    }
}
```

- [ ] **Step 6: Build it**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`
Expected: compiles (fix any crate-API drift — e.g. `keyring` v3 `Entry::new` returns `Result`). Iterate until clean.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/remind_check.rs src-tauri/capabilities/default.json
git commit -m "feat(desktop): headless --remind-check notifier (reminder)"
```

---

## Task 6: launchd agent + keychain bridge + UI wiring

**Files:**
- Create: `src-tauri/src/launchd.rs`
- Modify: `src-tauri/src/lib.rs` (commands: `install_reminder_agent`, `remove_reminder_agent`, `save_desktop_token`)
- Create: `src/lib/desktop/isTauri.ts` (port), `src/lib/desktop/reminders.ts`
- Modify: the reminders toggle UI to call the desktop glue when `isTauri()`

- [ ] **Step 1: launchd install/remove (Rust)**

```rust
// src-tauri/src/launchd.rs
use std::path::PathBuf;

const LABEL: &str = "app.hearth.desktop.reminder";

fn plist_path() -> PathBuf {
    let mut p = dirs::home_dir().unwrap();
    p.push("Library/LaunchAgents");
    let _ = std::fs::create_dir_all(&p);
    p.push(format!("{LABEL}.plist"));
    p
}

fn exe_path() -> String {
    std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

pub fn install() -> Result<(), String> {
    let plist = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>{exe}</string><string>--remind-check</string>
  </array>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>"#, LABEL = LABEL, exe = exe_path());
    std::fs::write(plist_path(), plist).map_err(|e| e.to_string())?;
    // reload
    let _ = std::process::Command::new("launchctl").arg("unload").arg(plist_path()).status();
    std::process::Command::new("launchctl").arg("load").arg(plist_path())
        .status().map(|_| ()).map_err(|e| e.to_string())
}

pub fn remove() -> Result<(), String> {
    let p = plist_path();
    let _ = std::process::Command::new("launchctl").arg("unload").arg(&p).status();
    let _ = std::fs::remove_file(&p);
    Ok(())
}
```

- [ ] **Step 2: Tauri commands in `lib.rs`**

```rust
mod launchd;

#[tauri::command]
fn save_desktop_token(token: String) -> Result<(), String> {
    keyring::Entry::new("app.hearth.desktop", "desktop-token")
        .and_then(|e| e.set_password(&token))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn install_reminder_agent() -> Result<(), String> { launchd::install() }

#[tauri::command]
fn remove_reminder_agent() -> Result<(), String> {
    let _ = keyring::Entry::new("app.hearth.desktop", "desktop-token").and_then(|e| e.delete_credential());
    launchd::remove()
}
```
Add the three to `invoke_handler![...]`.

- [ ] **Step 3: Web glue**

```ts
// src/lib/desktop/isTauri.ts
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
```
```ts
// src/lib/desktop/reminders.ts
import { isTauri } from './isTauri'

export async function enableDesktopReminders(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  const { token } = await fetch('/api/me/desktop-token', { method: 'POST' }).then(r => r.json())
  await invoke('save_desktop_token', { token })
  await invoke('install_reminder_agent')
}
export async function disableDesktopReminders(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('remove_reminder_agent')
}
```
Add `@tauri-apps/api` to `package.json` deps if absent (`docker compose exec app npm install @tauri-apps/api`).

- [ ] **Step 4: Call the glue from the reminders toggle**

In the reminders UI (where `subscribe()`/`unsubscribe()` are called — `ReminderControls`/`useReminders`), after enabling reminders call `await enableDesktopReminders()`, and after disabling call `await disableDesktopReminders()`. These no-op in the browser (`isTauri()` false), so web is unaffected.

- [ ] **Step 5: App-launch self-heal**

In `lib.rs` `setup`, if reminders should be on, ensure the agent exists. Simplest: have the web app call `enableDesktopReminders()` on load when `isTauri()` && reminders enabled (reuses the token refresh). Add that to the same place the web checks reminder state on mount.

- [ ] **Step 6: Build + commit**

Run: `cd src-tauri && cargo build 2>&1 | tail -20` (clean), then `docker compose exec -T app npx tsc --noEmit` (clean).
```bash
git add src-tauri/src/launchd.rs src-tauri/src/lib.rs src/lib/desktop/ package.json package-lock.json
git commit -m "feat(desktop): launchd agent + keychain token bridge + UI wiring"
```

---

## Task 7: Add letters + offline cache

**Files:**
- Modify: `src/app/api/me/desktop-pending/route.ts`
- Modify: `src-tauri/src/remind_check.rs`
- Reference: `src/app/api/letters/arrived/route.ts` (the delivered-unviewed query)

- [ ] **Step 1: Return arrived letters from the endpoint**

In `desktop-pending`, replace `letters: []` with the same query backing `/api/letters/arrived` (delivered, not viewed, for this user). Map to minimal display fields — **no ciphertext**:

```ts
const arrived = await prisma.letter.findMany({
  where: { userId: verified.userId, isDelivered: true, /* unviewed flag per arrived route */ },
  select: { id: true },
})
const letters = arrived.map(l => ({ id: l.id, title: 'a letter arrived ✨', body: 'from past you' }))
```
Confirm the exact `where` (viewed flag name) against `src/app/api/letters/arrived/route.ts` before writing — match it exactly so web and desktop agree on "arrived".

- [ ] **Step 2: Offline cache in the notifier**

In `remind_check.rs`, on a successful fetch write the JSON to `…/app.hearth.desktop/notif-cache.json`; on fetch failure, load that cache and still evaluate the **reminder** (skip letters when from cache). Keep it simple: cache only the `reminder` object; letters require a live fetch.

- [ ] **Step 3: Build + verify letters**

`cd src-tauri && cargo build` (clean). Then mark a self-letter delivered (or seal one due now), run the notifier directly, and confirm a letter notification:
```bash
./src-tauri/target/debug/app --remind-check   # or the built binary path
```
(Ensure a token is in the keychain first — enable reminders in the app once.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/me/desktop-pending/route.ts src-tauri/src/remind_check.rs
git commit -m "feat(desktop): letter-arrived notifications + offline reminder cache"
```

---

## Task 8: End-to-end manual verification (the real proof)

**Files:** none.

- [ ] **Step 1: Fast loop — notifier fires without the app open**

Enable reminders in the app once (writes token + installs agent). Set `reminderTime` ~1 min in the past, ensure no entry today, then run the headless binary directly:
```bash
./src-tauri/target/debug/app --remind-check
```
Expected: a native "meethril" notification appears, **no window opens**. Run again → no second notification (deduped).

- [ ] **Step 2: Suppression**

Journal an entry, run `--remind-check` again → **no** notification.

- [ ] **Step 3: Closed-app via launchd**

Set `StartInterval` temporarily to `60` (edit plist or rebuild), set reminderTime to now, **quit the app**, wait ≤1 min → notification fires with the app fully closed. Restore `1800` after.

- [ ] **Step 4: Letters**

Seal/flip a self-letter to delivered, run `--remind-check` → "a letter arrived ✨"; run again → not repeated; open the app and view it on web → `/arrived` empties → still not repeated.

- [ ] **Step 5: Sync + disable**

Change `reminderTime` on web while the app is closed → next `--remind-check` uses the new time. Toggle reminders **off** in the app → `~/Library/LaunchAgents/app.hearth.desktop.reminder.plist` is gone and keychain token deleted → no further notifications.

- [ ] **Step 6: Web unaffected**

In a browser (not Tauri), confirm reminders opt-in still subscribes and `remindersEnabled` is set; multiple browsers each keep a subscription row.

- [ ] **Step 7: Final commit (if fixups)**

```bash
git add -A && git commit -m "fix(desktop): notifications verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** §1 web multi-sub → Task 4; §2 `desktop-pending` → Tasks 3 & 7; §3 launchd → Task 6; §4 headless notifier → Tasks 5 & 7; §5 token bridge → Task 6; §6 auth (improved to a scoped desktop token, not the session token) → Tasks 1 & 3; §7 drop in-app scheduler → N/A (never ported; badge-clear-on-focus ported in Task 5); enablement gap (not in spec) → Task 2.
- **Deviation from spec, intentional:** auth uses a dedicated scoped desktop token (httpOnly cookies can't be read by JS; this is cleaner + safer) and adds `profile.remindersEnabled` as the desktop enablement signal. Both flagged to the user.
- **macOS only** (launchd); Windows/Linux deferred behind `launchd.rs` (swap for a Task Scheduler module).
- **Highest-risk task is Task 1** (token auth) — it gates everything; proven by `curl` in Task 3 Step 4 before any Rust.
- **Rust crate-API drift** (`keyring` v3, `notify-rust` v4, `reqwest` blocking) may need small compile fixes during Tasks 5–7 — each ends with a `cargo build` gate.
