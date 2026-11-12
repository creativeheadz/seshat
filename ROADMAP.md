# Roadmap

The working queue lives on the Seshat board in DocuVault
Tasks; this file is the public outline.

Revival plan for the Seshat fork of Laverna (renamed
2026-11-11; do not ship new work under the Laverna
name). Dossier: `DOSSIER.md`. Working prompts per
phase: `PROMPTS.md`. Statuses verified against the
tree on 2026-11-12 unless noted.

## Phase 0 - launch

- [x] Courtesy notice on Laverna/laverna (informing,
      not asking): gh-1023, filed 2026-11-11.
- [ ] Log any upstream reply the day it lands (no fuse;
      the fork proceeds regardless).
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

## Where we are (2026-11-12)

Phases 0 and 1 are done; v0.8.0-rc1 is out. Since then,
work that was not on this roadmap landed on master and is
in the debug install, but not in a release or the demo:

- [x] Interface redesign for hundreds of notes: one
      continuous list under date headings, search in
      place, compact density, reading and writing on one
      measure, day and night themes, self-hosted type,
      new icons (2026-11-12). README has a Design section.
- [x] Editor: one column with a Preview switch; side by
      side is a remembered choice; heading button fixed
      (2026-11-12).
- [x] Desktop shell (Tauri v2, Linux deb), ahead of its
      Phase 2 slot (2026-11-11). Exports and the
      encryption backup save through a native dialog;
      the webview has no download manager (2026-11-12).
- [x] Obsidian vault importer (2026-11-11); notes keep
      their file dates and the tags written in their
      text (2026-11-12).
- [x] Debug install follows the latest commit: git hooks
      plus cron build and install it (2026-11-12).
- [x] Speed: start-up at 3,000 notes 1.6 s to 0.8 s,
      list switching 1.4 s to 0.65 s, typing in a long
      note 4x less main-thread work (2026-11-12, numbers
      in the commit).
- [x] Encryption lifecycle proven end to end in a
      browser test: on, unlock, tags, search, edit, wrong
      password, off. Nothing readable in the store while
      on; notes byte-identical after (2026-11-12). This
      is the gh-992 fixture from BACKLOG.md; the garbling
      did not reproduce.

Suite: 23 Playwright cases and 31 Vitest cases, green in
CI on every push.

## Phase 2 - make it trustworthy, then release

Ordered. Each line is done when a test or a run proves
it, as in Phase 1.

### 2a - trust (data safety first)

- [x] Changing the encryption password: covered by a
      browser test, including a wrong old password and a
      change abandoned half way (2026-11-12).
- [x] "All notes gone" (gh-683, gh-670, gh-440): an
      address naming a profile that does not exist made
      an empty database and showed an empty list. It
      falls back to the default profile (2026-11-12).
- [x] Legacy database opened by the current migrate
      (gh-864): covered by the migrate unit test.
- [ ] Desktop unlock with a bad or empty key (gh-808):
      needs the real window.
- [x] Key derivation (2026-11-12). The app kept a plain,
      unsalted SHA-256 of the password to check it
      against, in the configs store and in every export:
      a way round PBKDF2 for anyone holding either. The
      check is now a salted PBKDF2 value at 600,000
      rounds; an old one is accepted and replaced on the
      next unlock. New setups stretch the key 600,000
      times too (10,000 before), through WebCrypto where
      there is one, with SJCL as the fallback and reader.
      Proven against a profile made by the real rc2
      build: unlocks, notes identical, ciphertext
      untouched. One way: rc2 and older cannot open an
      upgraded profile.
- [ ] Existing profiles stay at the iteration count they
      were encrypted with. Raising it is a manual step
      (Settings, Encryption); consider offering it.
- [x] Checked 2026-11-12, nothing to fix: after turning
      encryption off each note keeps an `encryptedData`
      field, but it is empty, not old ciphertext, and
      edits afterwards are stored as plain text.
- [ ] The derived key lives in sessionStorage for the
      session. Decide whether the desktop app should lock
      on idle or on window close only.

### 2b - desktop shell

- [x] Links: a link in a note used to replace the app
      with the web page (no way back), and About's links
      did nothing. They open in the system browser now,
      and the window refuses to navigate away from the
      app whatever the page does (2026-11-12; the shell
      side is compiled and unit-stubbed, not yet clicked
      in the real window).
- [ ] The rest of that audit: attachment drag and drop,
      the file pickers for import, printing.
- [ ] Storage and encryption run on the main thread in
      WebKit (workers are switched off by an old Safari
      workaround in app.js). Re-enable and test in the
      real window.
- [ ] Signing: macOS and Windows, with Wegweiser's
      identities under Old Forge Technologies (decided
      2026-11-12, see TAURI.md). Exercised at v0.8.0
      final; prereleases are Linux only.
- [ ] Full bundle matrix at v0.8.0 final (AppImage, RPM,
      MSI, NSIS reject the -rc suffix).

### 2c - Obsidian vault

- [x] Decided 2026-11-12: a one-time copy, never a link
      (DOSSIER.md). Seshat is not a front end for a vault.
- [x] A second import of the same vault adds nothing: a
      file whose title and text are already here is left
      alone and counted in the summary; links from new
      notes point at the note that is here (2026-11-12).
- [ ] Attachments: counted and skipped today.

### 2d - release

- [x] The strings added with the redesign are translated
      in all 30 other locales (2026-11-12). Machine
      written, not yet read by native speakers; a wrong
      one is a one-line fix in `app/locales`.
- [x] v0.8.0-rc2 with everything above the line, and the
      demo on gh-pages refreshed from it (2026-11-12).
      Found after the tag: Settings > Editor is blank in
      rc1 and rc2 (fixed on master). Goes out with rc3.
- [ ] v0.8.0 after soak.
- [ ] Create `creativeheadz/seshat` on Gitea and push
      (carried over from Phase 0).

### 2e - sync

- [ ] WebDAV or NAS sync, the direction decided when
      Dropbox was dropped (DOSSIER.md). Until then notes
      live on one machine and Export data is the backup.
      RemoteStorage is still in the tree, unvalidated.

### 2f - speed, when it is needed

- [ ] Every list switch re-reads all notes and, with
      encryption on, decrypts them again. One decrypted
      copy in memory, filtered, makes switching instant.
      Touches the code gh-932 lived in: do it as its own
      pass with tests first.
- [ ] Draw only the rows on screen. Not needed at
      hundreds of notes; the next step past about 3,000.

## Phase 3 - modernize

- Marionette 2 to a current framework (the 17k-line
  job: 171 files verified in tree), keeping the
  IndexedDB format readable.
- KaTeX for MathJax 2.7.
- PWA: a service worker in place of the app cache
  manifest the build still writes (browsers dropped it).
- Guaranteed v0.7.51 data import, fixture-tested beyond
  the single note covered today.

## Phase 4 - community

- Work the triaged backlog oldest-first; announce where
  notes-app users are; decide month 4+ with whoever
  shows up (webclipper revival is the obvious carrot).
