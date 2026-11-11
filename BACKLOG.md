# Backlog (triage of 447 upstream issues, 2026-11-11)

Upstream tracker is read-only to us (maintainers silent), so this
file IS the triaged backlog: every bucket below carries a
disposition. Verified means reproduced against this tree with
headless Chromium unless noted.

## P0 - data loss, fixed this session

- gh-932 / gh-1016 (dup pair): cancel the discard dialog, then
  save, and the note ghosts (saved with trash=1: stuck
  `deleteData` trashed it post-save). FIXED in
  `apps/notes/form/controller.js` (`onConfirmCancel` resets the
  flags); regression test in `test/e2e/smoke.spec.js`.

## P0 - data-loss scares, kept open

- gh-992: encrypt setup garbles content (`### Unzipping` became
  transposed garbage; locked out via gh-407). No repro steps.
  Fixture sketch: encrypt notes with markdown-heavy content,
  wrong-password and re-encrypt paths.
- gh-683 / gh-670 / gh-440: "all notes gone" (welcome screen or
  empty list, one with encryption+sync). No repro steps.
  Fixture sketch: profile mismatch and cleared-storage boots.
- gh-864: v0.7.1 to v0.7.51 upgrade presented empty db.
  Fixture sketch: legacy-shaped db opened by current migrate.
- gh-808: desktop unlock hangs silently. Desktop-only; needs
  the Tauri shell to repro. Fixture sketch: bad/empty key
  against encrypted notes-db.
- gh-997: Dropbox .json restore tooling (docs + import path).

## P1 - verified present

- gh-414: note with a reference to a nonexistent `#file:`
  renders blank (file plugin throws). Probable one-spot
  hardening in `markdown-it-file.js`.

## Verified fixed by revival work (close with pointer)

- gh-446 (was: XML code block loses data on save/reopen):
  probed, XML survives. Was upstream-labeled fixed; holds
  under markdown-it 15 + DOMPurify.
- gh-990 (backslash escape in inline code): markdown-it 15
  renders correct CommonMark.
- gh-1001 (`return [];` shown as svg): gone under Prism 1.30.
- gh-1006 (`>` shown as entity in code): text renders
  correctly (entity remains in source by design).
- gh-996 (dependabot: open 0.0.5 to 7.x): done, open@7.4.2.

## Upstream-labeled fixed, accepted (in-tree since 2018)

gh-335, gh-333, gh-393, gh-421 (dark theme), gh-641, gh-460
(Palemoon: unverifiable here, no such browser in CI).

## Buckets (bulk dispositions)

- Sync (70 issues): resolved by the sync decision
  (DOSSIER.md Decisions; Dropbox verdict pending Andrei).
  gh-6 (55 comments, non-commercial storage) backs the
  WebDAV Phase 2 direction. gh-1011/#1000/#994 (Dropbox
  dead) close under it.
- Build/install (13): dead gulp-3/bower era; closed by
  resuscitation (two-command `npm ci` + `gulp build`).
- Demo down (gh-1021, gh-991): superseded by the fork demo
  at https://creativeheadz.github.io/seshat/ .
- Desktop-only (gh-1014 macOS verify, gh-1005/1004 Pango,
  gh-995 segfault, gh-993): Phase 2 signed Tauri shell.
- Features (91 enhancements): Phase 3 oldest-first.
  Heavy threads: gh-6 sync (55), gh-421 dark theme (38),
  gh-358 attachments (26), gh-174 mobile (21).
  gh-1013 (txt/docx import), gh-1010, gh-1009, gh-1002
  (PDF export) are feature candidates with demand.
- Questions (37): stale; close with pointer to discussions.
- Meta: gh-998 (read-first), gh-971 (forking thread, 19
  comments: this revival is the answer).

## Counts

447 open upstream: 29/2014, 39/2015, 168/2016, 127/2017,
59/2018, 25 in 2019-2025. Labels: 91 enhancement, 67 bug,
37 question. This file accounts for every bucket; individual
2016-2017 bugs not named above default to bulk-close (stale,
unreproducible against the revived tree) once P0/P1 clear.
