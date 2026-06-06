use std::path::PathBuf;

const LABEL: &str = "app.hearth.desktop.reminder";

fn plist_path() -> PathBuf {
    let mut p = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("Library/LaunchAgents");
    let _ = std::fs::create_dir_all(&p);
    p.push(format!("{LABEL}.plist"));
    p
}

fn exe_path() -> String {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn install(base_url: &str) -> Result<(), String> {
    // base_url is a URL origin (e.g. https://host); XML-escape `&` defensively
    // in case a query-string-like origin ever slips through. `<`/`>`/quotes are
    // not valid in an origin, so `&` is the only realistic special char.
    let base_url = base_url.replace('&', "&amp;");
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{label}</string>
  <key>ProgramArguments</key><array>
    <string>{exe}</string><string>--remind-check</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MEETHRIL_BASE_URL</key><string>{base_url}</string>
  </dict>
  <key>StartInterval</key><integer>1800</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>"#,
        label = LABEL,
        exe = exe_path(),
        base_url = base_url
    );
    let path = plist_path();
    std::fs::write(&path, plist).map_err(|e| e.to_string())?;
    let _ = std::process::Command::new("launchctl")
        .arg("unload")
        .arg(&path)
        .status();
    std::process::Command::new("launchctl")
        .arg("load")
        .arg(&path)
        .status()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn remove() -> Result<(), String> {
    let path = plist_path();
    let _ = std::process::Command::new("launchctl")
        .arg("unload")
        .arg(&path)
        .status();
    let _ = std::fs::remove_file(&path);
    Ok(())
}
