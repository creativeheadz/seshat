#!/bin/sh
# seshat-debug-update: keep a local debug install tracking the newest
# GitHub release (prereleases included). No auth needed (public repo).
# Install: sudo dpkg -i <Seshat_*_amd64.deb>, then crontab:
#   */30 * * * * /path/to/repo/scripts/seshat-debug-update.sh
set -u

REPO="creativeheadz/seshat"
PKG="seshat"
LOG_DIR="$HOME/.local/share/seshat-debug"
LOG="$LOG_DIR/update.log"

mkdir -p "$LOG_DIR"
log() { echo "$(date -u +%FT%TZ) $1" | tee -a "$LOG"; }

installed="$(dpkg-query -W -f='${Version}' "$PKG" 2>/dev/null || true)"
if [ -z "$installed" ]; then
    log "not installed; run: sudo dpkg -i <Seshat_*_amd64.deb>"
    exit 1
fi

release_json="$(curl -s -m 30 "https://api.github.com/repos/$REPO/releases?per_page=1")"
tag="$(printf '%s' "$release_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["tag_name"])')"
if [ -z "$tag" ] || [ "$tag" = "null" ]; then
    log "could not list releases"
    exit 1
fi
latest="${tag#v}"

# Normalize for Debian version comparison (~ sorts before everything,
# so 0.8.0~rc1 < 0.8.0, unlike the raw hyphen form).
norm() { printf '%s' "$1" | sed 's/-/~-/g'; }
if dpkg --compare-versions "$(norm "$installed")" ge "$(norm "$latest")"; then
    log "up to date ($installed)"
    exit 0
fi

url="$(printf '%s' "$release_json" | python3 -c '
import json,sys
for a in json.load(sys.stdin)[0]["assets"]:
    if a["name"].endswith("_amd64.deb"):
        print(a["browser_download_url"])
        break
')"
if [ -z "$url" ]; then
    log "$tag has no amd64 deb yet"
    exit 1
fi

tmp="$(mktemp -d)/seshat.deb"
if ! curl -s -m 300 -L -o "$tmp" "$url"; then
    log "download failed: $url"
    exit 1
fi

log "upgrading $installed -> $latest"
if sudo -n dpkg -i "$tmp" >>"$LOG" 2>&1; then
    log "installed $latest (restart the app to switch builds)"
else
    log "dpkg failed (needs passwordless sudo for dpkg)"
    exit 1
fi
