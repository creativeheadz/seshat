# Seshat desktop (Tauri v2)

The desktop shell wraps the static `dist/` build. No app code runs
outside the webview: all logic stays in the audited frontend.

## Build

Prereqs: Node 22, Rust stable, and on Linux the Tauri system
libraries (`libwebkit2gtk-4.1-dev build-essential curl wget file
libssl-dev libayatana-appindicator3-dev librsvg2-dev`).

```bash
npm ci                        # frontend deps + vendor tree
npx gulp build                # dist/ (also runs automatically)
npx tauri build               # bundles for the host platform
npx tauri dev                 # live dev (serves gulp on :9000)
```

## Versions (four places, keep in sync)

`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
and `constants.VERSION` in `app/scripts/constants.js` all carry the
release version. Bump them together.

## Bundle targets

Prereleases ship `deb` on Linux only: AppImage, RPM, MSI and NSIS
version grammars reject the `-rc1` suffix. At v0.8.0 final, restore
the full matrix in `tauri.conf.json` (`appimage`, `rpm`, `msi`,
`nsis`; `app`/`dmg` are already listed for macOS).

## Icons

Regenerate from the emblem (must be square first):

```bash
npx tauri icon /tmp/seshat-icon-src.png
```

Then delete `src-tauri/icons/android` and `ios/` (desktop only).

## Signing

Linux builds are unsigned (normal for deb/rpm).

**macOS** (unverified: MacBook unreachable while writing this).
Builds run on Andrei's MacBook, driven the Wegweiser way: identities
from `~/.wegweiser-apple/` (`devid_application.p12`,
`devid_installer.p12`) travel to the Mac for the job, build with

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<TEAM>)"
export APPLE_ID=<apple-id> APPLE_PASSWORD=<app-specific-password>
export APPLE_TEAM_ID=<TEAM>
npx tauri build --bundles app,dmg
```

then notarize + staple the `.dmg`/`.app` with `notarytool`/`stapler`
(see Wegweiser `documentation/macos-signing.md` for the full dance).
Pending Andrei's call on reusing his personal Developer ID for Seshat.

**Windows** (unverified: signer unreachable while writing this).
Build on OLDFORGE-SIGNER (needs a Rust toolchain first), then sign
the exes/MSI/MSIX through the Azure Artifact Signing account from
Wegweiser `documentation/agent-code-signing.md`, or set
`bundle.windows.signCommand` in `tauri.conf.json` to invoke the
signer CLI. Pending Andrei's call on reusing the wegweiser-agent
certificate profile.

## CI

`.github/workflows/desktop.yml` builds Linux on `v*` tags and
attaches the `.deb` to the GitHub release (create the release first
with `gh release create`, which pushes the tag). It also runs on
manual dispatch for dry runs. macOS/Windows stay workstation-driven
like Wegweiser: no secrets in CI, no surprise bills.

## Debug install (Andrei's rig)

`scripts/seshat-debug-update.sh` keeps a local install tracking the
newest release, prereleases included: it compares the installed
version against the GitHub releases API (no auth needed) and
`dpkg -i`s a newer `*_amd64.deb` when one lands. Runs every
30 minutes via cron; log at `~/.local/share/seshat-debug/update.log`.
Restart the app after an upgrade to switch builds.
