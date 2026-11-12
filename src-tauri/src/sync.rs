//! Sync transport: a folder of record files on this machine, and
//! rsync to carry it to and from a remote.
//!
//! The remote is anything rsync can reach: a storage box over SSH
//! (`user@host:path`, with the port it listens on) or another folder
//! on this machine (an absolute path, which some other tool may in
//! turn be syncing). Nothing here decides what a record should
//! become; that is `modules/sync/engine.js`. This only moves files.
//!
//! Three rules:
//! - Nothing is ever deleted on either side (no `--delete`). A note
//!   that was removed is a record that says so.
//! - The app never sees a password or a key. SSH runs in batch mode
//!   with the user's own configuration, agent and known hosts; a host
//!   it does not already trust fails instead of being accepted.
//! - What the page sends is checked before it reaches a command line:
//!   the remote, the profile, the store and every file name. rsync is
//!   run directly, with no shell in between.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

/// The kinds of record that are synced, one folder each.
const STORES: &[&str] = &["notes", "notebooks", "tags", "profile"];

/// Kept beside them and never transferred: what this device last
/// agreed on with the remote. It belongs with the mirror, so that
/// losing one means losing both and the two cannot disagree.
const LOCAL_ONLY: &str = "state";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntry {
    name: String,
    size: u64,
    /// Milliseconds since the Unix epoch.
    mtime: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFile {
    name: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    ok: bool,
    /// Which step failed: "prepare", "pull" or "push".
    step: String,
    /// What rsync or ssh said, shortened.
    message: String,
}

fn is_safe_word(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && !value.starts_with('-')
        && !value.starts_with('.')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

pub fn is_profile(value: &str) -> bool {
    is_safe_word(value, 64)
}

pub fn is_store(value: &str) -> bool {
    STORES.contains(&value) || value == LOCAL_ONLY
}

/// `<id>.json`, where the id is the record's own.
pub fn is_file_name(value: &str) -> bool {
    match value.strip_suffix(".json") {
        // ids are GUIDs, hashes joined with dashes, or imported names
        Some(id) => !id.is_empty() && id.len() <= 200 && !id.starts_with('.')
            && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
        None => false,
    }
}

/// A remote rsync may be pointed at.
///
/// Either an absolute path on this machine, or `[user@]host:path`.
/// The characters allowed leave no room for an option, a second
/// argument, or anything a remote shell would interpret.
pub fn is_remote(value: &str) -> bool {
    if value.is_empty() || value.len() > 300 || value.starts_with('-') || value.contains("..") {
        return false;
    }

    let path_ok = |p: &str| {
        p.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/' | '~'))
    };

    if value.starts_with('/') {
        return path_ok(value);
    }

    match value.split_once(':') {
        Some((host, path)) => {
            !host.is_empty()
                && !host.starts_with('-')
                && host
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '@'))
                && host.matches('@').count() <= 1
                && !path.starts_with('-')
                && path_ok(path)
        }
        None => false,
    }
}

fn mirror_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("sync");
    Ok(dir)
}

fn store_dir(root: &Path, profile: &str, store: &str) -> Result<PathBuf, String> {
    if !is_profile(profile) {
        return Err("invalid profile name".to_string());
    }
    if !is_store(store) {
        return Err("unknown store".to_string());
    }
    Ok(root.join(profile).join(store))
}

pub fn list_in(root: &Path, profile: &str, store: &str) -> Result<Vec<SyncEntry>, String> {
    let dir = store_dir(root, profile, store)?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        // Nothing synced yet
        Err(_) => return Ok(Vec::new()),
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_file_name(&name) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(meta) if meta.is_file() => meta,
            _ => continue,
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(SyncEntry { name, size: meta.len(), mtime });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn read_in(root: &Path, profile: &str, store: &str, names: &[String]) -> Result<Vec<SyncFile>, String> {
    let dir = store_dir(root, profile, store)?;
    let mut out = Vec::new();

    for name in names {
        if !is_file_name(name) {
            return Err(format!("invalid file name: {}", name));
        }
        // A file that went away or is not text is simply not returned
        if let Ok(bytes) = std::fs::read(dir.join(name)) {
            if let Ok(content) = String::from_utf8(bytes) {
                out.push(SyncFile { name: name.clone(), content });
            }
        }
    }
    Ok(out)
}

pub fn write_in(root: &Path, profile: &str, store: &str, files: &[SyncFile]) -> Result<usize, String> {
    let dir = store_dir(root, profile, store)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    for file in files {
        if !is_file_name(&file.name) {
            return Err(format!("invalid file name: {}", file.name));
        }
        // Written beside the target and moved into place, so a crash
        // never leaves half a record where rsync would pick it up.
        // (The name starts with a dot: never listed, never matched.)
        let tmp = dir.join(format!(".{}.part", file.name));
        std::fs::write(&tmp, file.content.as_bytes()).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, dir.join(&file.name)).map_err(|e| e.to_string())?;
    }
    Ok(files.len())
}

fn shorten(text: &[u8]) -> String {
    let text = String::from_utf8_lossy(text);
    let text = text.trim();
    let mut out: String = text.chars().rev().take(600).collect::<String>().chars().rev().collect();
    if out.len() < text.len() {
        out.insert_str(0, "… ");
    }
    out
}

/// One rsync run. `only_dirs` creates the folder structure on the
/// receiving side and transfers no files.
fn rsync(source: &str, target: &str, profile: &str, port: Option<u16>, over_ssh: bool, only_dirs: bool) -> Result<(), String> {
    let mut command = Command::new("rsync");
    command.env("LC_ALL", "C");

    // -r recurse, -t keep times, -c compare contents (records are
    // small, and two versions can share a size and a second)
    command.arg("-rtc").arg("--timeout=60");

    if over_ssh {
        let mut ssh = String::from("ssh -o BatchMode=yes -o ConnectTimeout=20");
        if let Some(port) = port {
            ssh.push_str(&format!(" -p {}", port));
        }
        command.arg("-e").arg(ssh);
    }

    // This profile's record folders and nothing else: not another
    // profile, not this device's own state, not the partial files
    // `write_in` leaves for a moment (dot files).
    command.arg(format!("--include=/{}/", profile));
    for store in STORES {
        command.arg(format!("--include=/{}/{}/", profile, store));
        if !only_dirs {
            command.arg(format!("--include=/{}/{}/*.json", profile, store));
        }
    }
    command.arg("--exclude=*");

    command.arg(format!("{}/", source.trim_end_matches('/')));
    command.arg(format!("{}/", target.trim_end_matches('/')));

    let output = command
        .output()
        .map_err(|e| format!("could not run rsync ({}); is it installed?", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(shorten(&output.stderr))
    }
}

/// Pull, or push, one profile between the local mirror and a remote.
pub fn transfer_in(root: &Path, remote: &str, port: Option<u16>, profile: &str, direction: &str) -> SyncReport {
    let fail = |step: &str, message: String| SyncReport { ok: false, step: step.to_string(), message };

    if !is_remote(remote) {
        return fail("prepare", "the sync address is not a folder or user@host:path".to_string());
    }
    if !is_profile(profile) {
        return fail("prepare", "invalid profile name".to_string());
    }

    for store in STORES {
        if let Err(e) = std::fs::create_dir_all(root.join(profile).join(store)) {
            return fail("prepare", e.to_string());
        }
    }

    let over_ssh = !remote.starts_with('/');
    let local = root.to_string_lossy().into_owned();

    match direction {
        "pull" => {
            // Make sure the folders exist over there first: pulling
            // from a remote that was never used is then just empty.
            if !over_ssh {
                if let Err(e) = std::fs::create_dir_all(remote) {
                    return fail("prepare", e.to_string());
                }
            }
            if let Err(e) = rsync(&local, remote, profile, port, over_ssh, true) {
                return fail("prepare", e);
            }
            if let Err(e) = rsync(remote, &local, profile, port, over_ssh, false) {
                return fail("pull", e);
            }
        }
        "push" => {
            if let Err(e) = rsync(&local, remote, profile, port, over_ssh, false) {
                return fail("push", e);
            }
        }
        _ => return fail("prepare", "direction must be pull or push".to_string()),
    }

    SyncReport { ok: true, step: direction.to_string(), message: String::new() }
}

#[tauri::command]
pub fn sync_list(app: tauri::AppHandle, profile: String, store: String) -> Result<Vec<SyncEntry>, String> {
    list_in(&mirror_root(&app)?, &profile, &store)
}

#[tauri::command]
pub fn sync_read(app: tauri::AppHandle, profile: String, store: String, names: Vec<String>) -> Result<Vec<SyncFile>, String> {
    read_in(&mirror_root(&app)?, &profile, &store, &names)
}

#[tauri::command]
pub fn sync_write(app: tauri::AppHandle, profile: String, store: String, files: Vec<SyncFile>) -> Result<usize, String> {
    write_in(&mirror_root(&app)?, &profile, &store, &files)
}

/// Runs rsync off the main thread: a slow network must not freeze
/// the window.
#[tauri::command]
pub async fn sync_transfer(app: tauri::AppHandle, remote: String, port: Option<u16>, profile: String, direction: String) -> Result<SyncReport, String> {
    let root = mirror_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || transfer_in(&root, &remote, port, &profile, &direction))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("seshat-sync-test-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn file(name: &str, content: &str) -> SyncFile {
        SyncFile { name: name.to_string(), content: content.to_string() }
    }

    #[test]
    fn accepts_real_remotes_and_refuses_anything_that_could_be_an_option() {
        for good in [
            "u670586-sub2@u670586.your-storagebox.de:seshat",
            "hetzner-backup:seshat/notes",
            "host.example:",
            "/home/andrei/Sync/seshat",
            "user@10.0.0.5:~/seshat",
        ] {
            assert!(is_remote(good), "{} should be accepted", good);
        }
        for bad in [
            "", "-e sh", "--rsh=sh", "host:-oProxyCommand=x", "host:path;rm -rf ~",
            "host:$(id)", "host:`id`", "host:a b", "user@host", "relative/path",
            "host:../outside", "/tmp/../etc", "a@b@c:path", "host:path\n", "-host:path",
            "host:pa'th", "host:pa\"th", "host:pa|th", "host:pa&th", "host:pa>th",
        ] {
            assert!(!is_remote(bad), "{:?} should be refused", bad);
        }
    }

    #[test]
    fn accepts_record_names_only() {
        assert!(is_file_name("0d7a2f3c-1b2c-4d5e-8f90-123456789abc.json"));
        assert!(is_file_name("205744345-1115253717107326892.json"));
        assert!(is_file_name("seed-12.json"));
        for bad in ["", ".json", "a.txt", "../a.json", "a/b.json", ".hidden.json", "a b.json", "a.json.part"] {
            assert!(!is_file_name(bad), "{:?} should be refused", bad);
        }
        assert!(is_profile("notes-db") && is_profile("work"));
        assert!(!is_profile("../x") && !is_profile("") && !is_profile("-x") && !is_profile("a/b"));
        assert!(is_store("notes") && is_store("state") && !is_store("configs") && !is_store("../notes"));
    }

    #[test]
    fn writes_lists_and_reads_records() {
        let root = scratch("io");

        assert_eq!(list_in(&root, "notes-db", "notes").unwrap().len(), 0);
        write_in(&root, "notes-db", "notes", &[file("a.json", "{\"a\":1}"), file("b.json", "héllo")]).unwrap();

        let listed = list_in(&root, "notes-db", "notes").unwrap();
        assert_eq!(listed.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), vec!["a.json", "b.json"]);
        assert_eq!(listed[0].size, 7);
        assert!(listed[0].mtime > 0);

        let read = read_in(&root, "notes-db", "notes", &["b.json".to_string(), "missing.json".to_string()]).unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].content, "héllo");

        assert!(write_in(&root, "notes-db", "notes", &[file("../escape.json", "x")]).is_err());
        assert!(write_in(&root, "../up", "notes", &[file("a.json", "x")]).is_err());
        assert!(read_in(&root, "notes-db", "nope", &[]).is_err());
        assert!(!root.join("escape.json").exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    /// Two devices and a remote folder, with the real rsync.
    #[test]
    fn two_mirrors_meet_through_a_remote_folder() {
        if Command::new("rsync").arg("--version").output().is_err() {
            eprintln!("rsync not installed; skipping");
            return;
        }

        let a = scratch("dev-a");
        let b = scratch("dev-b");
        let remote_dir = scratch("remote");
        let remote = remote_dir.to_string_lossy().into_owned();

        // a writes two notes and a notebook, and pushes
        write_in(&a, "notes-db", "notes", &[file("n1.json", "one"), file("n2.json", "two")]).unwrap();
        write_in(&a, "notes-db", "notebooks", &[file("nb.json", "book")]).unwrap();
        // another profile, this device's state and stray files stay behind
        write_in(&a, "private", "notes", &[file("secret.json", "not for this remote")]).unwrap();
        write_in(&a, "notes-db", "state", &[file("notes.json", "{}")]).unwrap();
        std::fs::write(a.join("notes-db").join("notes").join(".n3.json.part"), "half").unwrap();
        std::fs::write(a.join("notes-db").join("notes").join("readme.txt"), "stray").unwrap();

        let report = transfer_in(&a, &remote, None, "notes-db", "pull");
        assert!(report.ok, "pull from an unused remote: {}", report.message);
        let report = transfer_in(&a, &remote, None, "notes-db", "push");
        assert!(report.ok, "push: {}", report.message);

        assert!(remote_dir.join("notes-db/notes/n1.json").exists());
        assert!(remote_dir.join("notes-db/notebooks/nb.json").exists());
        assert!(!remote_dir.join("private").exists());
        assert!(!remote_dir.join("notes-db/state").exists());
        assert!(!remote_dir.join("notes-db/notes/.n3.json.part").exists());
        assert!(!remote_dir.join("notes-db/notes/readme.txt").exists());

        // b pulls and has them
        let report = transfer_in(&b, &remote, None, "notes-db", "pull");
        assert!(report.ok, "{}", report.message);
        let got = read_in(&b, "notes-db", "notes", &["n1.json".to_string(), "n2.json".to_string()]).unwrap();
        assert_eq!(got.iter().map(|f| f.content.as_str()).collect::<Vec<_>>(), vec!["one", "two"]);

        // b changes one to something of the same length, pushes; a
        // pulls and sees the change (content is compared, not size)
        write_in(&b, "notes-db", "notes", &[file("n1.json", "uno")]).unwrap();
        assert!(transfer_in(&b, &remote, None, "notes-db", "push").ok);
        assert!(transfer_in(&a, &remote, None, "notes-db", "pull").ok);
        assert_eq!(read_in(&a, "notes-db", "notes", &["n1.json".to_string()]).unwrap()[0].content, "uno");

        // nothing is ever deleted: a file gone locally stays remote
        std::fs::remove_file(a.join("notes-db/notes/n2.json")).unwrap();
        assert!(transfer_in(&a, &remote, None, "notes-db", "push").ok);
        assert!(remote_dir.join("notes-db/notes/n2.json").exists());

        // an address that is not one never reaches rsync
        let report = transfer_in(&a, "--rsh=sh", None, "notes-db", "push");
        assert!(!report.ok && report.step == "prepare");

        for dir in [a, b, remote_dir] {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn an_unreachable_host_is_an_error_not_a_hang() {
        if Command::new("rsync").arg("--version").output().is_err() {
            return;
        }
        let root = scratch("unreachable");
        // .invalid never resolves (RFC 2606)
        let report = transfer_in(&root, "nobody@seshat-test.invalid:seshat", Some(23), "notes-db", "pull");
        assert!(!report.ok);
        assert_eq!(report.step, "prepare");
        assert!(!report.message.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }
}
