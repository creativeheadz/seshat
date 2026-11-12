<p align="center">
  <img src="assets/seshat-hero.jpg" alt="Seshat writing among the stars" width="800">
</p>

<h1 align="center">
  <img src="assets/seshat-logo.png" alt="Seshat emblem" width="48" align="absmiddle">
  Seshat
</h1>

<p align="center">
  <strong>Private, offline-first Markdown notes with client-side encryption.</strong><br>
  No account. No server. Your notes never leave your machine unencrypted.
</p>

<p align="center">
  <a href="https://github.com/creativeheadz/seshat/actions/workflows/ci.yml"><img src="https://github.com/creativeheadz/seshat/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/creativeheadz/seshat/releases"><img src="https://img.shields.io/github/v/release/creativeheadz/seshat?include_prereleases" alt="Release"></a>
  <img src="https://img.shields.io/badge/license-MPL--2.0-blue" alt="MPL-2.0">
</p>

<p align="center">
  <strong><a href="https://creativeheadz.github.io/seshat/">Try the live demo</a></strong>
  — it runs entirely in your browser; nothing is uploaded anywhere.
</p>

Seshat is an independent, renamed revival of [Laverna](https://github.com/Laverna/laverna),
the open-source Evernote alternative that went dormant in 2018. Named after the
Egyptian goddess of writing and wisdom, it keeps everything that made Laverna good
and drags the engineering into the present: the tree builds on Node 22, ships a
Vitest + Playwright suite green in CI, and has had its dependency CVEs swept
(34 down to 2, both with no fixed release in their lines — see
[ROADMAP.md](ROADMAP.md)).

## Features

- Markdown editor with live preview, distraction-free and normal modes
- Built for reading: notes are set in a book face on a measure of about
  68 characters, with day and night themes
- One continuous list that stays quick with hundreds of notes: date
  headings, search as you type, a compact density
- Client-side AES encryption (PBKDF2 key, random IV per note)
- Fully offline: notes live in IndexedDB/localStorage, no account needed
- Notebooks, tags, favorites, tasks, file attachments
- Math (TeX), syntax highlighting, full-text search
- Import/export (JSON backup, settings)
- 30+ interface locales

## Quick start

**Docker** (easiest local copy):

```bash
docker build -t seshat .
docker run -d --name seshat -p 8905:80 seshat
```

then open http://localhost:8905.

**From source** (Node 18+):

```bash
git clone https://github.com/creativeheadz/seshat.git
cd seshat
npm ci            # installs deps and vendors frontend libraries
npx gulp build    # produces dist/
cd dist && python3 -m http.server 8901
```

then open http://localhost:8901.

**Desktop and mobile**: the old Electron shell and Cordova builds are retired.
A signed Tauri desktop app and a PWA are on the [roadmap](ROADMAP.md#phase-2---modernize);
until then, any modern desktop or mobile browser works.

## Security model

- Notes are encrypted in your browser with AES-CCM (SJCL), keyed by
  PBKDF2-HMAC-SHA256 stretched from your password: 600,000 iterations
  for a new setup, configurable. A profile encrypted earlier keeps the
  count it was made with (10,000 by default) until you raise it under
  Settings, Encryption, which re-encrypts the notes.
- To check a password the app stores a salted PBKDF2 value, never the
  password or a plain hash of it. Up to 0.8.0-rc2 it stored an unsalted
  SHA-256, also inside exported settings and backups; treat export files
  made by those versions as you would the password. The stored value is
  replaced the first time a newer build unlocks the profile, after which
  older builds can no longer open it.
- Rendered Markdown is sanitized with DOMPurify; titles and inputs pass
  through an XSS filter. A hostile-content test (scripts, event handlers,
  `javascript:` and `data:` URLs) runs in CI on every push.
- Sync backends see only ciphertext when encryption is on — but see below.

## Sync status (honest version)

Seshat is local-first today. The old Dropbox sync is **removed**: it relied on
killed long-lived tokens, a dead receiver host, and a pre-refresh SDK.
RemoteStorage ships but is **unvalidated** against modern servers. A WebDAV/NAS
backend is the planned Phase 2 direction; see
[BACKLOG.md](BACKLOG.md) and [DOSSIER.md](DOSSIER.md#decisions).

Whatever you do: **export backups** (Settings → Import/Export). No sync means
no second copy unless you make one.

## Data compatibility

Seshat reads Laverna v0.7.51 data: same IndexedDB/localStorage layout, same
SJCL legacy reader (pinned by frozen decrypt vectors in the test suite), and
the legacy migrator is covered too. Point it at an existing profile and your
notes come along. (Back up first anyway — see above.)

## Development

```bash
npm test          # Vitest unit suite
npm run test:e2e  # rebuild + Playwright smoke (Chromium)
npx gulp          # dev server with live reload on :9000
npx gulp test     # lint gate (jshint + jsonlint)
```

`npm run test:e2e` needs `npx playwright install chromium` once. CI runs
lint, build, smoke, unit, and e2e on every push. Please keep it green:
prove behavior changes with a test or a run, keep MPL-2.0 headers on
touched files, and never break reading v0.7.51 user data.

## Design

The interface was redrawn in 2026 around the words: one text block on a
fixed measure, the same face and size for writing as for reading.

- **Colour** comes from the emblem and the hero art: lapis by day, the
  logo's gold on night by night. Every colour is a custom property in
  `app/styles/theme-default/tokens.less`; nothing else names a hex value,
  which is what lets one set of rules serve both themes.
- **Type** is self-hosted, so the app stays offline: Literata for
  anything you read or write, Libre Franklin for the controls around it,
  IBM Plex Mono for code. `scripts/vendor.js` copies the font files from
  the pinned npm packages and writes their `@font-face` rules.
- **Icons** are Phosphor outlines drawn through CSS masks, plus Seshat's
  own seven-pointed star for favourites. Edit the map in
  `scripts/icons.js` and run `npm run icons`; the generated
  `app/styles/core/icons.less` is checked in.
- **Geometry** (rail, list column, measure) lives in
  `app/styles/core/variables.less`.

## Acknowledgments

Seshat stands on [Laverna](https://github.com/Laverna/laverna) by
wwebfor, wwwredfish, and some 200 contributors — including the translators
behind its 30+ locales. Upstream was notified
([courtesy note](https://github.com/Laverna/laverna/issues/1023)); new work
ships under the Seshat name only. All original MPL-2.0 headers are intact.

## License

[MPL-2.0](LICENSE). The typefaces (Literata, Libre Franklin, IBM Plex Mono)
are under the SIL Open Font License 1.1 and the icon outlines
([Phosphor](https://phosphoricons.com)) are MIT. Shipped third-party
libraries are MIT, BSD, Apache-2.0, MPL-2.0, or public domain — see the license BOM note in
[ROADMAP.md](ROADMAP.md).
