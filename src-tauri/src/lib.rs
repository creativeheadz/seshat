//! Desktop shell commands: Obsidian vault import (folder pick +
//! recursive markdown read), saving exported files, and opening
//! links outside the app. Sync transport lives in `sync.rs`.
//!
//! One IPC call carries the whole vault scan to the frontend, which
//! maps files to notes (see `modules/importExport/vault/`). Binary
//! attachments are reported, not read (v2).

use serde::Serialize;
use std::path::{Path, PathBuf};

mod sync;

/// Directories never descended into.
const SKIP_DIRS: &[&str] = &[".obsidian", ".git", ".trash", "node_modules"];

/// Extensions reported as skipped (attachments land in v2).
const SKIP_FILES: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "heic", "heif", "tif", "tiff", "psd",
    "mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "wma", "mid", "midi",
    "mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv",
    "pdf", "zip", "tar", "gz", "rar", "7z",
    "canvas", "base",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultFile {
    /// Path relative to the vault root, `/`-separated.
    path: String,
    content: String,
    /// Last modification, in milliseconds since the Unix epoch. The
    /// note keeps this as its date, so an imported vault is spread
    /// over the years it was written in, not stacked on import day.
    mtime: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultScan {
    root: String,
    files: Vec<VaultFile>,
    /// Non-markdown files found (reported so the UI can say so).
    skipped: Vec<String>,
}

fn is_skipped_dir(name: &str) -> bool {
    SKIP_DIRS.iter().any(|d| d.eq_ignore_ascii_case(name))
}

fn is_skipped_file(name: &str) -> bool {
    match name.rsplit('.').next() {
        Some(ext) => SKIP_FILES.iter().any(|e| e.eq_ignore_ascii_case(ext)),
        None => false,
    }
}

fn is_markdown(name: &str) -> bool {
    match name.rsplit('.').next() {
        Some(ext) => ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"),
        None => false,
    }
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let since_epoch = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    u64::try_from(since_epoch.as_millis()).ok()
}

fn rel_string(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn walk(dir: &Path, root: &Path, files: &mut Vec<VaultFile>, skipped: &mut Vec<String>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    // Sorted for deterministic imports.
    let mut entries: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();

    for path in entries {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        if path.is_dir() {
            if !is_skipped_dir(&name) {
                walk(&path, root, files, skipped);
            }
            continue;
        }

        if is_markdown(&name) {
            let bytes = std::fs::read(&path).unwrap_or_default();
            files.push(VaultFile {
                path: rel_string(root, &path),
                content: String::from_utf8_lossy(&bytes).into_owned(),
                mtime: mtime_ms(&path),
            });
        } else if is_skipped_file(&name) || !name.starts_with('.') {
            // Named attachment types plus any other visible non-markdown
            // file (code, text, docs): counted, left for v2.
            skipped.push(rel_string(root, &path));
        }
        // else: dotfiles silently ignored.
    }
}

/// Opens a folder picker and scans the chosen vault.
/// Returns `None` when the user cancels.
#[tauri::command]
fn import_vault() -> Result<Option<VaultScan>, String> {
    let dir = match rfd::FileDialog::new()
        .set_title("Import Obsidian vault")
        .pick_folder()
    {
        Some(dir) => dir,
        None => return Ok(None),
    };

    let mut files = Vec::new();
    let mut skipped = Vec::new();
    walk(&dir, &dir, &mut files, &mut skipped);

    Ok(Some(VaultScan {
        root: dir.to_string_lossy().into_owned(),
        files,
        skipped,
    }))
}

/// Decodes `%XX` escapes (the file name travels in a header).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() && input.is_char_boundary(i + 3) {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

/// Saves bytes the frontend produced (a backup, exported settings)
/// to a place the user picks.
///
/// The webview has no download manager, so the browser route (a blob
/// link) does nothing here. The body is the file itself; the
/// suggested name comes in the `x-file-name` header. Returns the
/// path written, or `None` when the dialog is cancelled.
#[tauri::command]
fn save_file(request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let bytes: Vec<u8> = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        // Older WebKitGTK cannot post a raw body; the bytes then
        // arrive as a JSON array of numbers.
        tauri::ipc::InvokeBody::Json(value) => {
            serde_json::from_value(value.clone()).map_err(|e| e.to_string())?
        }
    };

    let suggested = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();

    // A name only: never a path from the page
    let name = Path::new(&suggested)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "seshat-export".to_string());

    let path = match rfd::FileDialog::new()
        .set_title("Save")
        .set_file_name(&name)
        .save_file()
    {
        Some(path) => path,
        None => return Ok(None),
    };

    std::fs::write(&path, bytes).map_err(|e| format!("{}: {}", path.display(), e))?;

    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Addresses that belong in the system browser or mail client.
fn is_external(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")
}

/// Hands an address to the system's default application. The
/// address is passed as one argument, never through a shell.
fn open_in_system(url: &str) -> Result<(), String> {
    if !is_external(url) {
        return Err("only web and mail addresses can be opened".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("rundll32");
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = std::process::Command::new("xdg-open");

    let mut child = command.arg(url).spawn().map_err(|e| e.to_string())?;

    // Reap the helper when it exits
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

/// Opens a link from a note (or About) outside the app.
///
/// The window is the app: following a link inside it would replace
/// the notes with a web page and leave no way back.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open_in_system(&url)
}

/// Pages the window itself may show.
fn is_app_url(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "tauri" | "about" | "blob" | "data")
        || matches!(url.host_str(), Some("localhost") | Some("tauri.localhost"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      import_vault,
      save_file,
      open_external,
      sync::sync_list,
      sync::sync_read,
      sync::sync_write,
      sync::sync_transfer
    ])
    // Whatever the page does, the window never leaves the app: a
    // navigation to anywhere else goes to the system browser.
    .plugin(
      tauri::plugin::Builder::<tauri::Wry>::new("stay-in-app")
        .on_navigation(|_webview, url| {
          if is_app_url(url) {
            return true;
          }
          let _ = open_in_system(url.as_str());
          false
        })
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
