//! Obsidian vault import: folder pick + recursive markdown read.
//!
//! One IPC call carries the whole vault scan to the frontend, which
//! maps files to notes (see `modules/importExport/vault/`). Binary
//! attachments are reported, not read (v2).

use serde::Serialize;
use std::path::{Path, PathBuf};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![import_vault])
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
