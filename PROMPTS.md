# Working prompts

Starter prompts for AI-assisted revival sessions. Global
constraints for every batch: keep MPL-2.0 headers on
touched files, never break reading v0.7.51 user data,
no framework rewrite before phase 2, prove each fix
with a test or a run, not a diff review.

## 1 - build resuscitation

Goal: clean-checkout build on Node 22 plus green CI.
Map every bower.json dep to npm (pin versions), vendor
or drop the 4 git:// ones (Blob.js, Canvas-to-Blob,
device.js, remotestorage.js) with a note per decision,
replace Gulp 3 with Gulp 5 or Vite keeping the same
outputs, add a CI workflow (install, build, smoke).
Done when: fresh clone builds with two commands.

## 2 - CVE sweep

Goal: zero known CVEs in shipped deps. Upgrade
Bootstrap 3.3.6 to 3.4.1, markdown-it 7 to latest with
a DOMPurify swap for markdown-it-sanitizer, audit the
xss package chain, run `npm audit` and a license BOM
pass (flag anything not MIT/BSD/Apache/MPL). Write a
PoC render test with hostile note content (script tags,
event handlers, data: URLs). Done when: audit clean
and the hostile-content test passes.

## 3 - test harness

Goal: replace the unrunnable suite. Vitest for unit
(sjcl encrypt/decrypt round-trip incl. legacy vectors,
migrate.js), Playwright smoke (create note, encrypt,
reload, import a v0.7.51 IndexedDB fixture, render).
Delete Karma/PhantomJS/Nightwatch once replaced.
Done when: green in CI on every push.

## 4 - issue triage

Goal: turn 447 upstream issues into a roadmap. For each:
reproduce-or-close (no repro on current tree means
close with a written explanation), dedupe, label
(data-loss, build, sync, ui, feature). Keep every
data-loss scare open as P0 with a fixture sketch.
Done when: backlog is ordered and every close has a
reason a stranger could follow.

## 5 - Dropbox decision spike

Goal: a decision, not code. Time-boxed spike: can a new
Dropbox app key plus refresh-token flow and a new
receiver host restore sync, and who owns the key?
Alternative: drop Dropbox for WebDAV/NAS, folding
bratkartoffeln/laverna with author credit. Write the
tradeoffs plus a costed recommendation.
Done when: phase 1 has a sync line item with an owner.
