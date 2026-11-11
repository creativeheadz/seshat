# Roadmap

Revival plan for the Laverna fork. Dossier: `DOSSIER.md`.
Working prompts per phase: `PROMPTS.md`.

## Phase 0 - launch

- [ ] File the 3-path courtesy issue on Laverna/laverna.
- [ ] Two-week fuse; log any reply the day it lands.
- [x] Rename picked: Seshat (2026-11-11).
- [ ] Wire `origin` (Gitea) and `github` remotes; push
      history; self-hosted CI skeleton.
- [ ] Done when: public repo builds green on Node 22
      with zero code changes (docs-only commits fine).

## Phase 1 - stabilize (first release)

- [ ] Build: Bower deps to npm (vendor or drop the 4
      git:// ones), Gulp 3 to Gulp 5 or Vite.
      Done when: clean checkout builds on Node 22.
- [ ] CVE sweep: Bootstrap 3.3.6 to 3.4.1, markdown-it 7
      to 14 with DOMPurify, audit the xss chain, full
      `npm audit` / BOM license pass.
      Done when: zero known CVEs in shipped deps.
- [ ] Tests: Karma/PhantomJS to Vitest plus Playwright
      smoke (encrypt/decrypt round-trip, v0.7.51 fixture
      import, note render).
      Done when: suite green in CI on every push.
- [ ] Dropbox decision: new app key plus refresh flow
      and a new receiver host, or drop for WebDAV/NAS
      (fold bratkartoffeln's NAS direction with credit).
      Done when: sync works or the dead UI is gone.
- [ ] Re-host the static demo (static-laverna to Pages).
      Done when: demo URL opens a usable app.
- [ ] Triage the 447 upstream issues: close dead and
      duplicates with written explanations, keep
      data-loss scares as P0.
      Done when: backlog is a roadmap, not a pile.
- [ ] Tag a test release, then the first proper one.

Non-goals for phase 1: framework rewrite, P2P sync,
Cordova mobile, new features. Stabilize first.

## Phase 2 - modernize

- Marionette 2 to a current framework (the 17k-line
  job), keeping the IndexedDB format readable.
- KaTeX for MathJax 2.6; PWA plus signed Tauri desktop.
- KDF uplift for new notes with the SJCL reader kept.
- Guaranteed v0.7.51 data import, fixture-tested.

## Phase 3 - community

- Work the triaged backlog oldest-first; announce where
  notes-app users are; decide month 4+ with whoever
  shows up (webclipper revival is the obvious carrot).
