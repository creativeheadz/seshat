#!/bin/sh
# seshat-debug-update: keep the local install in step with the latest
# code, not with the latest release.
#
# "Latest code" is this checkout's HEAD: what was committed, merged or
# pulled on this machine. When the installed build was made from a
# different commit, the script builds that commit, bundles a .deb and
# installs it.
#
# It deliberately does not fetch. Building runs the project's install
# and build scripts and the result is installed with sudo, so whatever
# this follows can run code here. Following a remote would hand that
# to anyone able to push to it (a stolen token, a bad merge). A commit
# from another machine arrives when you pull it, which is a decision.
#
# The build happens in a private clone under ~/.cache/seshat-debug,
# never in this working tree: uncommitted work is not built, and a
# build cannot collide with a gulp or test run of your own.
#
# Triggers
#   git hooks   post-commit, post-merge, post-rewrite; set up once with
#               `scripts/seshat-debug-update.sh --install-hooks`
#   cron        fallback for anything the hooks miss:
#               */30 * * * * /path/to/repo/scripts/seshat-debug-update.sh
#
# Usage
#   seshat-debug-update.sh                  update if the install is stale
#   seshat-debug-update.sh --force          rebuild and reinstall regardless
#   seshat-debug-update.sh --status         show installed and latest commit
#   seshat-debug-update.sh --install-hooks  write the git hooks
#
# Needs: node, cargo and the Tauri system libraries (see TAURI.md),
# flock, and passwordless sudo for dpkg.
set -u

# Git exports these inside hooks; they would point every git call
# below at the wrong repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX 2>/dev/null || true

PKG="seshat"
TAURI_CLI="@tauri-apps/cli@2.12.4"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SELF="$REPO_DIR/scripts/$(basename "$0")"

STATE_DIR="$HOME/.local/share/seshat-debug"
LOG="$STATE_DIR/update.log"
BUILD_LOG="$STATE_DIR/build.log"
SHA_FILE="$STATE_DIR/installed-sha"
FAILED_FILE="$STATE_DIR/failed-sha"

CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/seshat-debug"
SRC="$CACHE_DIR/src"
TARGET="$CACHE_DIR/target"

mkdir -p "$STATE_DIR" "$CACHE_DIR"
log() { echo "$(date -u +%FT%TZ) $1" | tee -a "$LOG"; }
short() { printf '%s' "$1" | cut -c1-8; }

# The commit the install should be built from: local HEAD, nothing
# fetched (see the note at the top).
latest_commit() {
    git -C "$REPO_DIR" rev-parse HEAD
}

installed_commit() {
    # No package, no build: whatever the stamp says
    if ! dpkg-query -W -f='${Status}' "$PKG" 2>/dev/null | grep -q "install ok installed"; then
        return 0
    fi
    cat "$SHA_FILE" 2>/dev/null || true
}

# Cron and git hooks start with a bare PATH: add cargo, and the
# newest node that nvm has installed if none is on the path already.
load_toolchain() {
    PATH="$HOME/.cargo/bin:$PATH"
    if ! command -v node >/dev/null 2>&1; then
        nvm_bin="$(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
        [ -n "$nvm_bin" ] && PATH="$nvm_bin:$PATH"
    fi
    export PATH

    for tool in node npx cargo; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log "cannot build: $tool is not on PATH"
            return 1
        fi
    done
}

notify() {
    command -v notify-send >/dev/null 2>&1 || return 0
    : "${DBUS_SESSION_BUS_ADDRESS:=unix:path=/run/user/$(id -u)/bus}"
    export DBUS_SESSION_BUS_ADDRESS
    notify-send -a Seshat "Seshat" "$1" >/dev/null 2>&1 || true
}

# Build commit $1 in the private clone and install the .deb.
build_and_install() {
    sha="$1"

    # --shared borrows this checkout's objects, so any local commit
    # can be checked out without fetching.
    if [ ! -d "$SRC/.git" ]; then
        rm -rf "$SRC"
        git clone -q --shared --no-checkout "$REPO_DIR" "$SRC" || return 1
    fi
    git -C "$SRC" checkout -q -f --detach "$sha" || return 1

    cd "$SRC" || return 1

    # Dependencies only when the lockfile moved
    lock="$(sha256sum package-lock.json | cut -d' ' -f1)"
    if [ ! -d node_modules ] || [ "$(cat "$CACHE_DIR/lock-sha" 2>/dev/null)" != "$lock" ]; then
        npm ci >>"$BUILD_LOG" 2>&1 || return 1
        printf '%s' "$lock" >"$CACHE_DIR/lock-sha"
    fi

    # About shows which commit is running (reset by the next checkout)
    sed -i "s/\(constants\.VERSION = '[^'+]*\)'/\1+$(short "$sha")'/" app/scripts/constants.js

    CARGO_TARGET_DIR="$TARGET" npx --yes "$TAURI_CLI" build --bundles deb \
        >>"$BUILD_LOG" 2>&1 || return 1

    deb="$(ls -t "$TARGET"/release/bundle/deb/*.deb 2>/dev/null | head -1)"
    if [ -z "$deb" ]; then
        echo "no .deb under $TARGET/release/bundle/deb" >>"$BUILD_LOG"
        return 1
    fi

    if ! sudo -n dpkg -i "$deb" >>"$BUILD_LOG" 2>&1; then
        echo "dpkg failed (needs passwordless sudo for dpkg)" >>"$BUILD_LOG"
        return 1
    fi

    printf '%s' "$sha" >"$SHA_FILE"
}

install_hooks() {
    hooks="$(git -C "$REPO_DIR" rev-parse --absolute-git-dir)/hooks"
    mkdir -p "$hooks"

    for name in post-commit post-merge post-rewrite; do
        hook="$hooks/$name"
        if [ -e "$hook" ] && ! grep -q "seshat-debug-update" "$hook"; then
            echo "skipped $name: a hook of your own is already there ($hook)"
            continue
        fi
        cat >"$hook" <<EOF
#!/bin/sh
# seshat-debug-update: bring the installed app up to this commit.
# Runs detached so git returns straight away.
(setsid "$SELF" >/dev/null 2>&1 &)
EOF
        chmod +x "$hook"
        echo "installed $name"
    done
}

case "${1:-}" in
    --install-hooks)
        install_hooks
        exit 0
        ;;
    --status)
        want="$(latest_commit)" || exit 1
        have="$(installed_commit)"
        echo "latest code : $(short "$want")"
        echo "installed   : $(short "${have:-none}")"
        [ "$want" = "$have" ] && echo "in sync" || echo "stale"
        exit 0
        ;;
esac

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# One update at a time. A run that finds another one working leaves
# it to that run, which looks again for newer commits when it is done.
exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then
    log "an update is already running"
    exit 0
fi

while :; do
    want="$(latest_commit)" || { log "not a git checkout: $REPO_DIR"; exit 1; }
    have="$(installed_commit)"

    if [ "$FORCE" -eq 0 ] && [ "$want" = "$have" ]; then
        log "in sync ($(short "$want"))"
        exit 0
    fi

    # Do not rebuild a commit that is known not to build
    if [ "$FORCE" -eq 0 ] && [ "$(cat "$FAILED_FILE" 2>/dev/null)" = "$want" ]; then
        log "skipping $(short "$want"): its build failed (see $BUILD_LOG; --force retries)"
        exit 1
    fi
    FORCE=0

    load_toolchain || exit 1

    log "building $(short "$want") (installed: $(short "${have:-none}"))"
    : >"$BUILD_LOG"

    if build_and_install "$want"; then
        rm -f "$FAILED_FILE"
        log "installed $(short "$want") (restart the app to switch builds)"
        notify "Updated to $(short "$want"). Restart the app to switch."
    else
        printf '%s' "$want" >"$FAILED_FILE"
        log "build of $(short "$want") failed (see $BUILD_LOG)"
        notify "Build of $(short "$want") failed."
        exit 1
    fi
done
