# Roadmap

Revival plan for the Seshat fork of Laverna (renamed
2026-11-11; do not ship new work under the Laverna
name). Dossier: `DOSSIER.md`. Working prompts per
phase: `PROMPTS.md`. Statuses verified against the
tree on 2026-11-11 unless noted.

## Phase 0 - launch

- [ ] File the 3-path courtesy issue on Laverna/laverna
      (deferred 2026-11-11, lands before first release).
- [ ] Two-week fuse from filing; log any reply the day
      it lands.
- [x] Rename picked: Seshat (2026-11-11).
- [x] Wire `origin` (Gitea) and `github` remotes
      (2026-11-11; pushing to `github` only for now).
- [ ] Create `creativeheadz/seshat` on Gitea and push
      (deferred 2026-11-11: github-only for now).
- [x] CI skeleton on GitHub that records the current
      red state (`.github/workflows/ci.yml`, run 1 on
      2026-11-11: red at gulp with primordials, bower
      green).
- [x] README first pass: Seshat banner, legacy and
      dead-end notes (2026-11-11); full install
      rewrite waits for the Phase 1 green build.
- [x] Done when: `github` pushed, CI skeleton runs
      (met 2026-11-11, scoped). (Courtesy issue and
      Gitea remote deferred.) No code changes
      expected in this phase (docs-only commits
      fine). Note: a green build on Node 22 is
      impossible before Phase 1 (Gulp 3 primordials
      failure, confirmed by CI run 1).

## Phase 1 - stabilize (first release)

Order matters: build first (nothing else is provable
without it), then tests, then the CVE sweep on a
tested tree; sync decision, demo, and triage can
overlap once the build is green.

- [ ] Build: Bower deps to npm (bower still installs
      today via https normalization per CI run 1, but
      stays deprecated: vendor or drop the 4 git://
      ones: Blob.js, Canvas-to-Blob, device.js,
      remotestorage.js 0.12.1), Gulp 3 to Gulp 5 or
      Vite keeping the same outputs.
      Done when: clean checkout builds on Node 22
      with two commands; CI green.
- [ ] Tests: Karma/PhantomJS and Nightwatch to Vitest
      plus Playwright smoke (encrypt/decrypt
      round-trip incl. legacy vectors, v0.7.51
      fixture import, note render).
      Done when: suite green in CI on every push.
- [ ] CVE sweep: Bootstrap 3.3.6 to 3.4.1,
      markdown-it 7 to 14 with DOMPurify for
      markdown-it-sanitizer, audit the xss chain,
      full `npm audit` / BOM license pass.
      Done when: zero known CVEs in shipped deps;
      hostile-content render test passes.
- [ ] Dropbox decision: new app key plus refresh flow
      and a new receiver host (current key hardcoded
      in sync.js, receiver lived on dead laverna.cc,
      long-lived tokens dead since Sep 2021), or
      drop for WebDAV/NAS (fold bratkartoffeln's NAS
      direction with credit).
      Done when: sync works or the dead UI is gone.
- [ ] Re-host the static demo (static-laverna to Pages).
      Done when: demo URL opens a usable app.
- [ ] Triage the 447 upstream issues: close dead and
      duplicates with written explanations, keep
      data-loss scares as P0 with fixture sketches.
      Done when: backlog is a roadmap, not a pile.
- [ ] Tag a test release, then the first proper one.

Non-goals for phase 1: framework rewrite, P2P sync,
Cordova mobile, new features. Stabilize first.

## Phase 2 - modernize

- Marionette 2 to a current framework (the 17k-line
  job: 171 files verified in tree), keeping the
  IndexedDB format readable.
- KaTeX for MathJax 2.6; PWA plus signed Tauri desktop.
- KDF uplift for new notes with the SJCL reader kept.
- Guaranteed v0.7.51 data import, fixture-tested.

## Phase 3 - community

- Work the triaged backlog oldest-first; announce where
  notes-app users are; decide month 4+ with whoever
  shows up (webclipper revival is the obvious carrot).
