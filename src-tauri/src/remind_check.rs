use serde::Deserialize;

const KEYRING_SERVICE: &str = "app.hearth.desktop"; // bundle id (keychain service)
const KEYRING_USER: &str = "desktop-token";

#[derive(Deserialize)]
struct Pending {
  reminder: Option<Reminder>,
  #[serde(default)]
  letters: Vec<Letter>,
}

#[derive(Deserialize)]
struct Reminder {
  due: bool,
  title: String,
  body: String,
}

#[derive(Deserialize)]
struct Letter {
  #[allow(dead_code)]
  id: String,
  #[allow(dead_code)]
  title: String,
  #[allow(dead_code)]
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

  let pending: Pending = match resp.and_then(|r| r.error_for_status()).and_then(|r| r.json()) {
    Ok(p) => p,
    Err(_) => return, // offline/auth fail; cached fallback added in a later task
  };

  let mut state = state::load();
  if let Some(r) = pending.reminder {
    if r.due && !state.reminder_fired_today() {
      notify(&r.title, &r.body);
      state.mark_reminder_fired();
    }
  }
  // letters handled in a later task
  let _ = &pending.letters;
  state.save();
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
    #[allow(dead_code)]
    pub fn letter_shown(&self, id: &str) -> bool {
      self.shown_letter_ids.iter().any(|x| x == id)
    }
    #[allow(dead_code)]
    pub fn mark_letter_shown(&mut self, id: &str) {
      self.shown_letter_ids.push(id.to_string());
    }
    pub fn save(&self) {
      let _ = std::fs::write(path(), serde_json::to_string(self).unwrap_or_default());
    }
  }
}
