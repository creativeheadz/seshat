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

- [x] Build: Bower deps to npm (35 pinned packages,
      7 vendored byte-exact incl. the 4 git:// ones),
      Gulp 3 to Gulp 5 keeping the same outputs
      (2026-11-11). Done: two-command `npm ci` plus
      `gulp build`; CI green.
- [x] Tests: Karma/PhantomJS and Nightwatch to Vitest
      (15 unit: round-trip, frozen vectors, migrate)
      plus Playwright smoke (boot, note CRUD, render,
      encrypt, fixture import, gh-932 regression)
      (2026-11-11). Done: suite green in CI.
- [x] CVE sweep (2026-11-11): Bootstrap 3.4.1,
      markdown-it 15 with DOMPurify for
      markdown-it-sanitizer, jquery 3.7.1, underscore
      1.13.8, sjcl 1.0.9 (legacy vectors hold),
      codemirror 5.65, mathjax 2.7.9, prismjs 1.30,
      requirejs 2.3.8. Audit 34 to 2: bootstrap 3.4.1
      and mathjax 2.7.9 have no fixed release in
      their lines (accepted: client-side only, own
      notes; P2 rewrite removes both). xss chain
      audited (cleanXSS kept, xss unflagged). BOM:
      all MIT/BSD/Apache/MPL/public-domain.
      Hostile-content e2e passes.
- [x] Dropbox dropped 2026-11-11 (Andrei's call):
      module, SDK, receiver page, settings UI, config
      keys all removed; sync button hidden until a
      working backend exists. Done: the dead UI is
      gone; WebDAV/NAS is the Phase 2 direction.
- [x] Re-host the static demo: gh-pages branch,
      https://creativeheadz.github.io/seshat/
      (2026-11-11). Done: URL opens a usable app.
- [x] Triage the 447 upstream issues: `BACKLOG.md`
      (2026-11-11) with verified dispositions; gh-932
      pair fixed with regression test; data-loss
      scares kept as P0 with fixture sketches.
      Done: backlog is a roadmap, not a pile.
- [x] Test release v0.8.0-rc1 (2026-11-11); first
      proper one (v0.8.0) after soak.

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
