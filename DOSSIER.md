> Working copy, mirrored from Vanity/laverna.md on
> 2026-11-11. The Vanity copy stays canonical until the
> public fork lands; afterwards this file moves with it.

# Laverna - dossier

Upstream: https://github.com/Laverna/laverna (Laverna org)
License: MPL-2.0 (LICENSE in-tree, package.json and
bower.json agree)
Status: dormant - master HEAD 2018-02-16 (9e2caf9,
translation PR #914); newest ref activity May 2021
(non-master). 9.2k stars, 447 open issues.
Fork: Seshat (independent, renamed 2026-11-11).
Do not ship new work under the Laverna name.
Code: `Development/Laverna` (dir name kept, as Tiger/ for
Tigris). Remotes: `origin` Gitea, `github` GitHub face,
`upstream` Laverna/laverna.

Maintainers (all silent): wwebfor (920 commits),
wwwredfish (474), then a long tail (NWuensche 29,
talklittle 14, ...). No org contact found; courtesy goes
via a GitHub issue (repo is NOT archived, issues still
open) plus email if an address surfaces.

## Why

Open-source Evernote: Markdown notes, client-side
encryption, offline-first, no account, static-hostable
web app. Audience play over a 9.2k-star brand with
447 open issues of proven demand; privacy tooling that
suits an MSP with a security consultancy face. Zero
GitHub-flag risk: consumer notes, no offensive content
anywhere.

## Deep-dive findings (2026-11-11)

- 17,171 lines app JS in 171 files: RequireJS plus
  Marionette 2.4 / Backbone 1.3 / jQuery 3.1 /
  Bootstrap 3.3.6. View layer extinct upstream.
- Build dead on modern Node: Gulp 3.9.1 (Node 12+
  primordials failure, confirmed as `ReferenceError`
  by CI run 1 on 2026-11-11; also corroborated by the
  harleyw fork, whose first commits fix gulp/gracefs
  startup). Bower (deprecated 2017) with 4 git:// deps
  (Blob.js, Canvas-to-Blob, device.js,
  remotestorage.js 0.12.1): CI run 1 proved bower
  normalizes these to https and the install completes,
  so the red is Gulp alone. Bower stays deprecated
  regardless: npm-ify in Phase 1.
- Dropbox sync dead three ways: no refresh-token flow
  (long-lived tokens killed Sep 2021), OAuth receiver
  page lived on laverna.cc (dead), one shared hardcoded
  app key (sync.js:40). Matches issue #1011.
- Tests unrunnable: Karma 1 plus PhantomJS, Nightwatch
  0.9 plus Selenium, Cordova mobile (dead end), Firefox
  OS manifest (corpse).
- Known-vuln deps in tree: Bootstrap 3.3.6 XSS CVEs
  (fixed in 3.4.x), markdown-it 7 plus abandoned
  markdown-it-sanitizer 0.4.1 and xss 0.2.13.
- Desktop dead: laverna-desktop repo Jan 2018
  (Electron 1.7 era), unsigned, which is the macOS
  Gatekeeper complaint (#1014). No electron dep in the
  main package.json.
- Crypto is sound: AES-CCM via SJCL, PBKDF2 (10k
  iterations default, user-configurable), random IV per
  note. Keep SJCL as the legacy reader; uplift KDF for
  new notes.
- Data: IndexedDB/localStorage via localforage 1.4.2;
  migrate.js exists. Reading v0.7.51 format is the
  trust constraint for any rewrite.
- 31 locales, a real community asset; translation PRs
  are the last signs of life on master.
- Ecosystem gone: laverna.cc down (#1021, Jan 2025),
  P2P signaling server repo dead, webclipper and
  chrome-app dead, static-laverna prebuilt frozen
  Oct 2017. AUR package laverna 0.7.51-11 present but
  stale (maintainer funilrys, 21 votes, untouched since
  Oct 2018); README install line names pacaur (archived
  2018, one-line docs fix to yay/paru).
- 447 open issues, real user pain into 2025: #1021 demo
  down, #1020 fonts/responsive, #1016 discard bug,
  #1014 macOS verify, #1013 txt/docx import,
  #1011 Dropbox sync.
- Fork field (785 forks, full sweep 2026-11-11):
  top-by-stars all dead; two recent bursts, both
  personal, no community, no releases: harleyw/laverna_ai
  (Jul 2025, 12-day Tongyi-AI experiment, 1 star, dead
  4 months) and bratkartoffeln/laverna (Oct 2026, 2-day
  QNAP NAS port, 0 stars, silent 3 weeks). Seven other
  recent pushes all zero-change. No winning fork, but
  the field is warm: fork rule overruled by Andrei on
  2026-11-11 (neither burst is a general revival).
- Competition: Joplin owns the functional niche,
  Standard Notes/Proton and TiddlyWiki alive. Closest
  living analogue is zhfahim/anchor (AGPL-3.0, alive,
  1.6k stars, offline-first self-hosted notes; Andrei
  runs it on the homelab) - but it has no client-side
  encryption and needs its server. Laverna edge is
  zero-setup pure-static web, no account anywhere, with
  encryption built in.

## Courtesy

Repo is unarchived with issues open, so the 3-path note
can go as a GitHub issue; email if an address surfaces
for wwebfor or wwwredfish. Two-week fuse per pipeline,
then independent renamed fork.

## Plan (first batch, after fuse or blessing)

1. npm-ify the Bower deps (vendor or drop the 4 git://
   ones), Gulp 3 to Gulp 5 or Vite; prove build on
   Node 22 plus CI.
2. Bootstrap 3.3.6 to 3.4.1 (CVE close), markdown-it 7
   to 14 with a DOMPurify swap, audit the xss chain.
3. Karma/PhantomJS to Vitest unit plus Playwright smoke
   (encrypt/decrypt round-trip, v0.7.51 fixture import,
   note render).
4. Dropbox decision: new app key plus refresh flow and
   a new receiver host, or drop it for WebDAV/NAS (ask
   bratkartoffeln about folding the NAS direction with
   credit, Tigris NMU-fold model).
5. Re-host the static demo (static-laverna to Pages) to
   close the #1021 class of complaints.
6. Triage the 447 issues: close the dead and duplicates
   with written explanations, keep data-loss scares
   as P0.
7. Tag a test release.

Month 2 to 3 (modernize): Marionette to a current
framework (the 17k-line job), KaTeX for MathJax 2.6,
PWA plus signed Tauri desktop, KDF uplift with the SJCL
reader kept, guaranteed v0.7.51 import.

## Decisions

### Sync (spike 2026-11-11, awaiting Andrei)

Dropbox dead five ways: implicit flow (long-lived tokens
killed Sep 2021) with no refresh logic in sync.js;
receiver was laverna.cc/dropbox.html (host dead, and the
page 404s on vendor/dropbox/dropbox.js which never
existed); one shared hardcoded app key; vendored SDK
predates refresh support (no version string, no refresh
symbols); saveAccessToken has a dead expression (line 178)
and the flow was never exercised by tests.

Restore cost: new Andrei-owned app key (quota/abuse risk
on a shared key; per-user keys are setup friction),
SDK major upgrade (UMD/requirejs fit unverified),
PKCE/code-flow rewrite plus refresh plumbing, live
testing against a real Dropbox account. 2 to 4 sessions
plus credentials only Andrei can provide.

Drop cost: delete module, adapter, sync (475 lines),
dropbox.html, settings sync UI, config keys; r.js fails
the build on dangling refs, suite proves the rest. One
session. RemoteStorage stays as the unvalidated second
backend (0.12 to 2.x revalidation already deferred).

Recommendation: drop in phase 1, WebDAV/NAS in phase 2
(bratkartoffeln fold with credit needs author contact).
Local-first notes, the core value, are untouched.

## Log

- 2026-11-11: surfaced in the non-security older-than-2y
  sweep (star bands, topics, famous-name spot checks);
  probe-cloned to /tmp/laverna and deep-dived.
- 2026-11-11: full 785-fork recency sweep found the
  harleyw and bratkartoffeln bursts; fork rule overruled
  by Andrei ("write the dossier"), neither burst is a
  general revival.
- 2026-11-11: dossier written. Not yet cloned to
  Development/, no courtesy contact yet, no rename
  picked.
- 2026-11-11: phase 0 CI run 1 went red at gulp
  (primordials) with bower green; build findings
  corrected above. In-tree copy now live with the
  public fork (Vanity sync pending).

## Deferred (noted during deep-dive, out of first batch)

- P2P sync: signaling server gone, drop the feature.
- Cordova mobile: drop for PWA.
- Webclipper revival (Firefox ext, dead 2017).
- RemoteStorage 0.12 to 2.x revalidation.
- MathJax 2.6 to KaTeX.
- SJCL to libsodium/WebCrypto migration design (reader
  stays forever).
- README pacaur line to yay/paru; AUR package adoption.
