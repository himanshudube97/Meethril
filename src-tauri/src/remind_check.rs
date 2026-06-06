use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "app.hearth.desktop"; // bundle id (keychain service)
const KEYRING_USER: &str = "desktop-token";

#[derive(Deserialize)]
struct Pending {
  reminder: Option<Reminder>,
  #[serde(default)]
  letters: Vec<Letter>,
}

#[derive(Deserialize, Serialize, Clone)]
struct Reminder {
  due: bool,
  title: String,
  body: String,
}

#[derive(Deserialize)]
struct Letter {
  id: String,
  title: String,
  body: String,
}

fn base_url() -> String {
  std::env::var("MEETHRIL_BASE_URL").unwrap_or_else(|_| "http://localhost:3112".into())
}

fn device_tz() -> String {
  iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".into())
}

fn read_token() -> Option<String> {
  let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?;
  entry.get_password().ok()
}

pub fn run_remind_check() {
  let token = match read_token() {
    Some(t) => t,
    None => return,
  };

  let client = reqwest::blocking::Client::new();
  let resp = client
    .get(format!("{}/api/me/desktop-pending", base_url()))
    .bearer_auth(&token)
    .header("X-User-TZ", device_tz())
    .timeout(std::time::Duration::from_secs(10))
    .send();

  let mut state = state::load();

  let pending: Pending = match resp.and_then(|r| r.error_for_status()).and_then(|r| r.json()) {
    Ok(p) => p,
    Err(_) => {
      // Offline / auth failure. Fall back to the cached reminder so the daily
      // reminder still fires without a network connection. Letters require a
      // live fetch (we never cache their content) so they're skipped offline.
      if let Some(cached) = load_cached_reminder() {
        maybe_fire_reminder(&cached, &mut state);
        state.save();
      }
      return;
    }
  };

  // Successful fetch — persist the reminder object for the offline fallback.
  save_cached_reminder(pending.reminder.as_ref());

  if let Some(r) = &pending.reminder {
    maybe_fire_reminder(r, &mut state);
  }

  for l in &pending.letters {
    if !state.letter_shown(&l.id) {
      notify(&l.title, &l.body);
      state.mark_letter_shown(&l.id);
    }
  }

  state.save();
}

/// Fire the reminder notification iff it's due and hasn't already fired today.
/// Shared by the live-fetch path and the offline cache path.
fn maybe_fire_reminder(r: &Reminder, state: &mut state::State) {
  if r.due && !state.reminder_fired_today() {
    notify(&r.title, &r.body);
    state.mark_reminder_fired();
  }
}

fn cache_path() -> PathBuf {
  let mut p = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
  p.push("app.hearth.desktop");
  let _ = std::fs::create_dir_all(&p);
  p.push("notif-cache.json");
  p
}

/// Persist the latest server reminder for offline reuse. Writing `null`
/// (reminders disabled) clears the cache so we don't fire a stale reminder.
fn save_cached_reminder(reminder: Option<&Reminder>) {
  if let Ok(json) = serde_json::to_string(&reminder) {
    let _ = std::fs::write(cache_path(), json);
  }
}

/// Load the cached reminder, if any. Returns None when no cache exists or the
/// cached value was `null` (reminders disabled at last successful fetch).
fn load_cached_reminder() -> Option<Reminder> {
  let raw = std::fs::read_to_string(cache_path()).ok()?;
  serde_json::from_str::<Option<Reminder>>(&raw).ok().flatten()
}

fn notify(title: &str, body: &str) {
  let _ = notify_rust::Notification::new()
    .summary(title)
    .body(body)
    .show();
}

pub mod state {
  use serde::{Deserialize, Serialize};
  use std::path::PathBuf;

  #[derive(Default, Serialize, Deserialize)]
  pub struct State {
    pub reminder_fired_date: String,
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
    chrono::Local::now().format("%Y-%m-%d").to_string()
  }

  pub fn load() -> State {
    std::fs::read_to_string(path())
      .ok()
      .and_then(|s| serde_json::from_str(&s).ok())
      .unwrap_or_default()
  }

  impl State {
    pub fn reminder_fired_today(&self) -> bool {
      self.reminder_fired_date == today()
    }
    pub fn mark_reminder_fired(&mut self) {
      self.reminder_fired_date = today();
    }
    pub fn letter_shown(&self, id: &str) -> bool {
      self.shown_letter_ids.iter().any(|x| x == id)
    }
    pub fn mark_letter_shown(&mut self, id: &str) {
      self.shown_letter_ids.push(id.to_string());
    }
    pub fn save(&self) {
      let _ = std::fs::write(path(), serde_json::to_string(self).unwrap_or_default());
    }
  }
}
