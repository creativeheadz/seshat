/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const fixtureNote = require('../fixtures/note-v0751.json');

function trackErrors(page, errors, responses) {
    page.on('console', function(msg) {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    page.on('pageerror', function(err) {
        errors.push(String(err && err.stack || err));
    });
    page.on('response', function(res) {
        if (res.status() >= 400) {
            responses.push({status: res.status(), url: res.url()});
        }
    });
}

// Pre-existing cosmetic 404, identical in the 2017 build (the golden
// manifest has no dist/font/): one stylesheet references
// ../font/fontello.eot while the fonts ship under styles/. Icons
// render via the correct relative URL in the same file, so this
// allowance self-tightens: if the 404 ever disappears, the loadErrs
// budget below drops to zero with it.
function isKnown404(res) {
    return res.status === 404 && res.url.indexOf('font/fontello.eot') !== -1;
}

function amd(page, modules) {
    return page.evaluate(function(mods) {
        return new Promise(function(resolve, reject) {
            window.requirejs(mods, function() {
                resolve(Array.prototype.slice.call(arguments));
            }, reject);
        });
    }, modules);
}

test.describe('smoke', function() {
    let errors, responses;

    // Fresh contexts open the first-run wizard; seeding any notebook
    // makes the app auto-close it on reload (firstStart controller).
    async function dismissWizard(page) {
        var wizard = page.locator('#modal:has-text("Welcome to Seshat")');
        if (await wizard.count() === 0) {
            return;
        }
        await page.evaluate(async function() {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var notebooks = localforage.createInstance({name: 'notes-db', storeName: 'notebooks'});
            await notebooks.setItem('wiz-seed', {
                id: 'wiz-seed', type: 'notebooks', parentId: '0',
                name: 'seed', count: 0, trash: 0, created: 1, updated: 1,
            });
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
    }

    test.beforeEach(async function({page}) {
        errors = [];
        responses = [];
        trackErrors(page, errors, responses);
        await page.goto('/');
        await page.waitForSelector('#header--add', {timeout: 20000});
        await dismissWizard(page);
    });

    test.afterEach(async function() {
        var known = responses.filter(isKnown404),
            other = responses.filter(function(r) { return !isKnown404(r); });
        expect(other).toEqual([]);
        var loadErrs = errors.filter(function(e) {
            return e.indexOf('Failed to load resource') !== -1;
        });
        expect(loadErrs.length).toBeLessThanOrEqual(known.length);
        expect(errors.length).toBe(loadErrs.length);
    });

    test('boots with no console errors', async function({page}) {
        await expect(page.locator('#sidebar--navbar')).toBeVisible();
    });

    test('creates a note and renders markdown', async function({page}) {
        await page.click('#header--add');
        // Fullscreen editor must clear the 54px icon rail (no overlap).
        var titleBox = await page.locator('#editor--input--title').boundingBox();
        expect(titleBox.x).toBeGreaterThanOrEqual(54);
        await page.fill('#editor--input--title', 'Smoke note');
        await page.waitForSelector('#editor .CodeMirror');
        await page.evaluate(function() {
            document.querySelector('#editor .CodeMirror').CodeMirror
                .setValue('# Hello\n\nrender *me*.\n\n$x^2$\n\n```js\nvar a = 1;\n```\n\n' +
                    '[blob](blob:fake-uuid)\n\n[data](data:text/html,<b>x</b>)\n');
        });
        await page.click('.editor--save');

        await page.waitForSelector('.list--item.-note .list--item--title');
        await expect(page.locator('.list--item--title').first())
            .toContainText('Smoke note');

        await page.click('.list--item.-note >> nth=0');
        var content = page.locator('.content.-note');
        await page.waitForSelector('.content.-note h1');
        await expect(content).toContainText('Hello');
        // math plugin path (markdown-it 15 + vendored math 4.0.0)
        await expect(content.locator('.math.inline')).toHaveCount(1);
        // prism 1.30 highlight path
        await expect(content.locator('code .token')).not.toHaveCount(0);
        // DOMPurify URL policy: blob: (file embeds) preserved,
        // data:text/html neutered
        await expect(content.locator('a[href^="blob:"]')).toHaveCount(1);
        await expect(content.locator('a[href^="data:text/html"]')).toHaveCount(0);
    });

    test('renders hostile content inert', async function({page}) {
        await page.click('#header--add');
        await page.fill('#editor--input--title', 'Hostile <img src=x onerror="window.__pwned=1">');
        await page.waitForSelector('#editor .CodeMirror');
        await page.evaluate(function() {
            window.__pwned = undefined;
            document.querySelector('#editor .CodeMirror').CodeMirror.setValue(
                '<script>window.__pwned="script"</script>\n\n' +
                '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="window.__pwned=\'attr\'">\n\n' +
                '[js](javascript:window.__pwned="href")\n\n' +
                '<iframe src="data:text/html,<script>window.__pwned=\'frame\'</script>"></iframe>\n\n' +
                'safe *text*.'
            );
        });
        await page.click('.editor--save');

        await page.click('.list--item.-note >> nth=0');
        var content = page.locator('.content.-note');
        await page.waitForSelector('.content.-note');
        await expect(content).toContainText('safe text.');
        expect(await page.evaluate(function() { return window.__pwned; })).toBeUndefined();
        await expect(content.locator('script')).toHaveCount(0);
        await expect(content.locator('iframe')).toHaveCount(0);
        await expect(content.locator('[onerror]')).toHaveCount(0);
        await expect(content.locator('a[href^="javascript:"]')).toHaveCount(0);
        // hostile title renders as inert text too (save-path escaping)
        await expect(page.locator('.list--item--title').first()).toContainText('Hostile');
        expect(await page.locator('.list--item--title').first().locator('img').count()).toBe(0);
    });

    test('encrypt round-trips through the app crypto in-page', async function({page}) {
        var plaintext = await page.evaluate(async function() {
            var Sjcl = await new Promise(function(resolve, reject) {
                window.requirejs(['classes/sjcl'], function(S) { resolve(S); }, reject);
            });
            var crypto = new Sjcl(),
                configs = {
                    encrypt: '1', encryptIter: '1000', encryptTag: '128',
                    encryptKeySize: '256', encryptSalt: [1, 2, 3, 4, 5],
                },
                keys = crypto.deriveKey({configs: configs, password: 'e2e'}),
                ct = crypto.encrypt({configs: configs, string: 'in-page secret', keys: keys, iv: [9, 8, 7, 6]});
            return crypto.decrypt({configs: configs, string: ct, keys: keys});
        });
        expect(plaintext).toBe('in-page secret');
    });

    // gh-932/gh-1016: canceling the discard dialog then saving used
    // to ghost the note (stuck deleteData trashed it post-save).
    test('canceling the discard dialog then saving keeps the note', async function({page}) {
        await page.click('#header--add');
        await page.fill('#editor--input--title', 'cancel-test');
        await page.waitForSelector('#editor .CodeMirror');
        await page.evaluate(function() {
            var cm = document.querySelector('#editor .CodeMirror').CodeMirror;
            cm.setValue('precious content');
            cm.save();
        });
        await page.click('.editor--cancel');
        await page.waitForSelector('#modal .modal-dialog');
        await page.locator('#modal button').filter({hasText: /cancel/i}).first().click();
        await page.click('.editor--save');

        await page.waitForSelector('.list--item.-note');
        await page.click('.list--item.-note >> nth=0');
        await page.waitForSelector('.content.-note');
        await expect(page.locator('.content.-note')).toContainText('precious content');
    });

    // Gulp 5 decodes to UTF-8 by default, which once mangled every
    // shipped image and font with U+FFFD stuffing (copy streams now
    // force encoding:false).
    test('ships binary assets byte-exact', async function({page, request}) {
        var files = [
            'images/icon/icon-152x152.png',
            'images/icon/icon-310x150.png',
            'favicon.ico',
        ];
        for (var i = 0; i < files.length; i++) {
            var res = await request.get('/' + files[i]);
            expect(res.status()).toBe(200);
            var body = Buffer.from(await res.body()),
                src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', files[i]));
            expect(body.equals(src)).toBe(true);
        }
    });

    // Icon rail: persistent nav with active state.
    test('icon rail navigates between sections', async function({page}) {
        await expect(page.locator('.rail--item')).toHaveCount(6);
        await page.click('.rail--item[title="Trash"]');
        await page.waitForFunction(function() {
            return window.location.hash.indexOf('trashed') !== -1;
        });
        await expect(page.locator('.rail--item.active').first())
            .toHaveAttribute('href', '#/notes/f/trashed');
        await page.click('.rail--item[title="All notes"]');
        await page.waitForFunction(function() {
            return window.location.hash === '#/notes' || window.location.hash === '';
        });
    });

    // Silent-import fix: a non-backup file must say so, not vanish.
    test('importing a non-backup file reports an error', async function({page}) {
        await page.goto('/#/settings/importExport');
        await page.waitForSelector('#import-data-file', {state: 'attached'});
        await page.locator('#import-data-file').setInputFiles({
            name: 'note.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('# not a backup'),
        });
        await expect(page.locator('#modal')).toContainText('not a Seshat backup', {timeout: 30000});
    });

    // Dropbox removal: sync settings render with no dropbox UI.
    test('settings sync view renders without dropbox', async function({page}) {
        await page.goto('/#/settings/sync');
        var select = page.locator('#cloudStorage');
        await select.waitFor({timeout: 20000});
        await expect(select.locator('option')).toHaveCount(2);
        await expect(select).toContainText('RemoteStorage');
        await expect(page.locator('#group-dropboxKey')).toHaveCount(0);
    });

    test('imports a v0.7.51 fixture note and keeps it across reload', async function({page}) {
        await amd(page, ['localforage']).then(function() {
            return page.evaluate(async function(note) {
                var localforage = await new Promise(function(resolve, reject) {
                    window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
                });
                var notes = localforage.createInstance({name: 'notes-db', storeName: 'notes'});
                await notes.setItem(note.id, note);
            }, fixtureNote);
        });

        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        var item = page.locator('#note-' + fixtureNote.id + ' .list--item--title');
        await item.waitFor({timeout: 20000});
        await expect(item).toContainText('Fixture note');
    });

    // ---- 2026 redesign: one continuous list, search in place ----

    // Writes `count` plain notes straight into the store, a day
    // apart, newest first; one of them mentions a needle.
    async function seedNotes(page, count) {
        await page.evaluate(async function(count) {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var notes = localforage.createInstance({name: 'notes-db', storeName: 'notes'}),
                now   = Date.now();
            for (var i = 0; i < count; i++) {
                await notes.setItem('list-' + i, {
                    id: 'list-' + i, type: 'notes', title: 'Listed note ' + i,
                    content: i === 17 ? 'a needle in the haystack' : 'plain hay ' + i,
                    taskAll: 0, taskCompleted: 0,
                    created: now - i * 86400000, updated: now - i * 86400000,
                    notebookId: '0', tags: [], isFavorite: 0, trash: 0, files: [],
                });
            }
        }, count);
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
    }

    var shownRows = '.list--group:not(.hidden) .list--item.-note';

    // The list used to stop at ten notes per page.
    test('lists every note on one page under date headings', async function({page}) {
        await seedNotes(page, 30);
        await expect(page.locator('.list--item.-note')).toHaveCount(30);
        await expect(page.locator('#pageNav')).toHaveCount(0);
        await expect(page.locator('#header--count')).toHaveText('30');
        // Today, yesterday, then weeks and months
        expect(await page.locator('.list--heading').count()).toBeGreaterThan(3);
        await expect(page.locator('.list--heading').first()).toHaveText('Today');
    });

    // Bookmarks from the paged list (#/notes/p3) must not open an
    // empty list.
    test('an address with an old page number still lists the notes', async function({page}) {
        await seedNotes(page, 30);
        await page.goto('/#/notes/p3');
        await page.reload();
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        await expect(page.locator('.list--item.-note')).toHaveCount(30);
    });

    test('typing in search narrows the list in place', async function({page}) {
        await seedNotes(page, 30);
        await page.fill('#header--search--input', 'needle');
        await expect(page.locator(shownRows)).toHaveCount(1);
        await expect(page.locator(shownRows).locator('.list--item--title')).toHaveText('Listed note 17');
        await expect(page.locator('#header--count')).toHaveText('1');
        // Escape gives the whole list back
        await page.press('#header--search--input', 'Escape');
        await expect(page.locator(shownRows)).toHaveCount(30);
        await expect(page.locator('#header--search--input')).toHaveValue('');
    });

    test('compact list is remembered on this device', async function({page}) {
        await seedNotes(page, 5);
        await page.click('#header--density');
        await expect(page.locator('#sidebar')).toHaveClass(/-compact/);
        await expect(page.locator('.list--item--text').first()).toBeHidden();
        await page.reload();
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        await expect(page.locator('#sidebar')).toHaveClass(/-compact/);
    });

    // The measure: body text must not run the width of the window.
    test('a note is read on a measure of about 68 characters', async function({page}) {
        await seedNotes(page, 3);
        await page.setViewportSize({width: 1920, height: 1080});
        await page.click('.list--item.-note >> nth=0');
        await page.waitForSelector('.content.-note .prose');
        var ems = await page.evaluate(function() {
            var prose = document.querySelector('.content.-note .prose');
            return prose.getBoundingClientRect().width /
                parseFloat(window.getComputedStyle(prose).fontSize);
        });
        expect(ems).toBeGreaterThan(30);
        expect(ems).toBeLessThanOrEqual(36.1);
    });

    // Theme setting: pinned with an attribute, mirrored for boot.js
    // so the next load paints the right theme from the first frame.
    test('theme chosen in settings is pinned on the next load', async function({page}) {
        await page.evaluate(async function() {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var configs = localforage.createInstance({name: 'notes-db', storeName: 'configs'});
            await configs.setItem('theme', {name: 'theme', value: 'night'});
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
        expect(await page.evaluate(function() {
            return window.localStorage.getItem('seshat.theme');
        })).toBe('night');
        // Night paper is dark
        var paper = await page.evaluate(function() {
            return window.getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
        });
        expect(paper).toBe('#0e121e');
    });

    // ---- editor: one column, preview in place ----

    function editorValue(page) {
        return page.evaluate(function() {
            return document.querySelector('#editor .CodeMirror').CodeMirror.getValue();
        });
    }

    // `##Title` is not a heading in Markdown (no space). The button
    // used to turn it into `### itle`.
    test('heading button repairs hashes typed without a space', async function({page}) {
        await page.click('#header--add');
        await page.waitForSelector('#editor .CodeMirror');
        await page.evaluate(function() {
            var cm = document.querySelector('#editor .CodeMirror').CodeMirror;
            cm.setValue('##Title\nPlain');
            cm.setCursor({line: 0, ch: 0});
        });
        await page.click('.btn--wysiwyg[data-action="heading"]');
        expect(await editorValue(page)).toBe('## Title\nPlain');

        await page.evaluate(function() {
            document.querySelector('#editor .CodeMirror').CodeMirror.setCursor({line: 1, ch: 0});
        });
        await page.click('.btn--wysiwyg[data-action="heading"]');
        expect(await editorValue(page)).toBe('## Title\n# Plain');
        // and once more goes a level deeper, keeping every letter
        await page.click('.btn--wysiwyg[data-action="heading"]');
        expect(await editorValue(page)).toBe('## Title\n## Plain');
    });

    test('preview switch shows the rendered note in place of the source', async function({page}) {
        await page.click('#header--add');
        await page.waitForSelector('#editor .CodeMirror');
        // One column by default: no second pane beside the source
        await expect(page.locator('.editor--preview')).toBeHidden();
        await page.evaluate(function() {
            document.querySelector('#editor .CodeMirror').CodeMirror
                .setValue('## A heading\n\n##Not a heading\n\n#tagged');
        });
        // The source colours the tag and sizes the real heading
        await expect(page.locator('#editor .cm-hashtag')).toHaveText('#tagged');
        await expect(page.locator('#editor .cm-header-2').first()).toBeVisible();

        await page.click('.editor--read');
        await expect(page.locator('.editor--preview h2')).toHaveText('A heading');
        await expect(page.locator('.editor--preview h2')).toHaveCount(1);
        await expect(page.locator('#editor .CodeMirror')).toBeHidden();

        await page.click('.editor--read');
        await expect(page.locator('#editor .CodeMirror')).toBeVisible();
        await expect(page.locator('.editor--preview')).toBeHidden();
    });

    test('a layout picked from the menu is the one the editor opens in next', async function({page}) {
        await page.click('#header--add');
        await page.waitForSelector('#editor .CodeMirror');
        await expect(page.locator('body')).not.toHaveClass(/editor--fullscreen/);
        await page.click('.header.-form .dropdown-toggle');
        await page.click('.editor--mode a[data-mode="preview"]');
        await expect(page.locator('body')).toHaveClass(/-preview/);
        // side by side: both on show, so no switch
        await expect(page.locator('.editor--preview')).toBeVisible();
        await expect(page.locator('.editor--read')).toBeHidden();
        // and the preview follows the typing (after a pause)
        await page.evaluate(function() {
            document.querySelector('#editor .CodeMirror').CodeMirror.setValue('## Typed just now');
        });
        await expect(page.locator('.editor--preview h2')).toHaveText('Typed just now');

        // Start the app again from the list and open a new note
        await page.goto('/#/notes');
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await expect(page.locator('body')).not.toHaveClass(/-preview/);
        await page.click('#header--add');
        await page.waitForSelector('#editor .CodeMirror');
        await expect(page.locator('body')).toHaveClass(/-preview/);
    });

    // A note that reached the store without going through the editor
    // (a vault import) has its tags in the text only. The page links
    // them, so the link has to lead somewhere.
    test('a tag written in the text finds the note', async function({page}) {
        await page.evaluate(async function() {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var notes = localforage.createInstance({name: 'notes-db', storeName: 'notes'});
            await notes.setItem('imported', {
                id: 'imported', type: 'notes', title: 'Imported view',
                content: 'Body.\n\n**Tags:** #database #dashboard',
                taskAll: 0, taskCompleted: 0, created: Date.now(), updated: Date.now(),
                notebookId: '0', tags: [], isFavorite: 0, trash: 0, files: [],
            });
            await notes.setItem('other', {
                id: 'other', type: 'notes', title: 'No tags', content: 'plain',
                taskAll: 0, taskCompleted: 0, created: Date.now() - 1000, updated: Date.now(),
                notebookId: '0', tags: [], isFavorite: 0, trash: 0, files: [],
            });
        });
        await page.reload();
        await page.waitForSelector('#note-imported', {timeout: 20000});
        await page.click('#note-imported');
        await page.waitForSelector('.content.-note .prose');

        // listed beside the note as well as linked in the text
        await expect(page.locator('.note--tags a')).toHaveText(['#database', '#dashboard']);

        await page.locator('.content.-note .prose a', {hasText: '#dashboard'}).click();
        await expect(page.locator('#header--count')).toHaveText('1');
        await expect(page.locator('.list--item--title')).toHaveText(['Imported view']);

        // and the tag list has learnt both tags, without the note being rewritten
        await expect.poll(function() {
            return page.evaluate(async function() {
                var localforage = await new Promise(function(resolve, reject) {
                    window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
                });
                var names = [];
                await localforage.createInstance({name: 'notes-db', storeName: 'tags'})
                    .iterate(function(tag) { names.push(tag.name); });
                return names.sort().join(',');
            });
        }).toBe('dashboard,database');
        expect(await page.evaluate(async function() {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var note = await localforage.createInstance({name: 'notes-db', storeName: 'notes'}).getItem('imported');
            return note.tags.length;
        })).toBe(0);
    });

    // ---- encryption lifecycle (BACKLOG P0: gh-992 "encrypt setup
    // garbles content"). On, unlock, use, wrong password, off: the
    // notes must come back byte for byte, and never sit in the store
    // in plain text while encryption is on.
    test('notes survive turning encryption on, using it and turning it off', async function({page}) {
        test.setTimeout(120000);

        var seeded = [
            {id: 'enc-1', title: 'Unzipping', tags: ['ops', 'dashboard'],
                content: '### Unzipping\n\nRun `unzip -o file.zip` then:\n\n```bash\ntar -xzf a.tgz && echo "done" > /dev/null\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n#ops #dashboard'},
            {id: 'enc-2', title: 'Unicode', tags: [],
                content: 'Gr\u00fc\u00dfe, \u65e5\u672c\u8a9e, emoji \ud83d\ude80, ampersand & less < more >.\n\n- [ ] task one\n- [x] task two\n\n> quote'},
            {id: 'enc-3', title: 'Imported style', tags: [],
                content: 'Body.\n\n**Tags:** #database #dashboard'},
        ];

        function stored() {
            return page.evaluate(async function() {
                var localforage = await new Promise(function(resolve, reject) {
                    window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
                });
                var notes = [], encrypt;
                await localforage.createInstance({name: 'notes-db', storeName: 'notes'})
                    .iterate(function(note) { notes.push(note); });
                await localforage.createInstance({name: 'notes-db', storeName: 'configs'})
                    .iterate(function(config) { if (config.name === 'encrypt') { encrypt = String(config.value); } });
                return {notes: notes, encrypt: encrypt};
            });
        }

        // What the app reads back, decrypted
        function readBack() {
            return page.evaluate(async function() {
                var Radio = window.requirejs('backbone.radio'),
                    coll  = await Radio.request('notes', 'fetch', {profile: 'notes-db'});
                return (coll.fullCollection || coll).map(function(model) {
                    return {id: model.id, content: model.get('content'), tags: model.get('tags')};
                }).sort(function(a, b) { return a.id < b.id ? -1 : 1; });
            });
        }

        var expected = seeded.map(function(note) {
            return {id: note.id, content: note.content, tags: note.tags};
        });

        await page.evaluate(async function(seeded) {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var notes = localforage.createInstance({name: 'notes-db', storeName: 'notes'});
            for (var i = 0; i < seeded.length; i++) {
                await notes.setItem(seeded[i].id, {
                    id: seeded[i].id, type: 'notes', title: seeded[i].title,
                    content: seeded[i].content, tags: seeded[i].tags,
                    taskAll: 0, taskCompleted: 0, created: Date.now() - i * 1000, updated: Date.now(),
                    notebookId: '0', isFavorite: 0, trash: 0, files: [],
                });
            }
        }, seeded);
        await page.reload();
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        expect(await readBack()).toEqual(expected);

        // On
        await page.goto('/#/settings/encryption');
        await page.waitForSelector('#useEncryption');
        await page.check('#useEncryption');
        await page.fill('#encryptPass', 'first-pass');
        await page.click('.settings--save');
        await page.waitForSelector('#encryption-password input[name="password"]', {timeout: 20000});
        await page.fill('#encryption-password input[name="password"]', 'first-pass');
        await page.click('#encryption-password input[type="submit"]');
        await page.waitForSelector('#btn--next', {timeout: 30000});
        await page.click('#btn--next');

        // Unlock
        await page.waitForSelector('.-auth input[name="password"]', {timeout: 20000});
        await page.fill('.-auth input[name="password"]', 'first-pass');
        await page.click('.-auth button[type="submit"]');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});

        // Nothing readable in the store; everything readable in the app
        var locked = await stored();
        expect(locked.encrypt).toBe('1');
        locked.notes.forEach(function(note) {
            var record = JSON.stringify(note);
            expect(note.title).toBeUndefined();
            expect(note.content).toBeUndefined();
            ['Unzipping', 'Gr\u00fc\u00dfe', 'database', 'unzip -o'].forEach(function(word) {
                expect(record).not.toContain(word);
            });
        });
        expect(await readBack()).toEqual(expected);

        // The list, a tag (one of them only in a note's text) and
        // search in place all work on decrypted notes
        await expect(page.locator('#header--count')).toHaveText('3');
        await page.goto('/#/notes/f/tag/q/dashboard');
        await expect(page.locator('#header--count')).toHaveText('2');
        await page.goto('/#/notes');
        await expect(page.locator('#header--count')).toHaveText('3');
        await page.fill('#header--search--input', 'gr\u00fc\u00dfe');
        await expect(page.locator('#header--count')).toHaveText('1');
        await page.press('#header--search--input', 'Escape');

        // An edit is stored encrypted
        await page.goto('/#/notes/edit/enc-3');
        await page.waitForSelector('#editor .CodeMirror');
        await page.waitForFunction(function() {
            return document.querySelector('#editor .CodeMirror').CodeMirror.getValue().length > 5;
        });
        await page.evaluate(function() {
            var cm = document.querySelector('#editor .CodeMirror').CodeMirror;
            cm.setValue(cm.getValue() + '\n\nEdited under encryption.');
        });
        await page.click('.editor--save');
        await expect(page.locator('#note-enc-3 .list--item--text')).toContainText('Edited under');
        expect(JSON.stringify((await stored()).notes)).not.toContain('Edited under');
        expected[2].content += '\n\nEdited under encryption.';
        // saving in the editor fills the tag field from the text
        expected[2].tags = ['database', 'dashboard'];

        // A new session: a wrong password opens nothing
        await page.goto('/#/notes');
        await page.evaluate(function() { window.sessionStorage.clear(); });
        await page.reload();
        await page.waitForSelector('.-auth input[name="password"]', {timeout: 20000});
        await page.fill('.-auth input[name="password"]', 'not-the-password');
        await page.click('.-auth button[type="submit"]');
        await page.waitForTimeout(2000);
        await expect(page.locator('.list--item.-note:visible')).toHaveCount(0);
        await page.fill('.-auth input[name="password"]', 'first-pass');
        await page.click('.-auth button[type="submit"]');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        expect(await readBack()).toEqual(expected);

        // Off
        await page.goto('/#/settings/encryption');
        await page.waitForSelector('#useEncryption');
        await page.uncheck('#useEncryption');
        await page.click('.settings--save');
        await page.waitForSelector('#encryption-password input[name="oldpass"]', {timeout: 20000});
        await page.fill('#encryption-password input[name="oldpass"]', 'first-pass');
        await page.click('#encryption-password input[type="submit"]');
        await page.waitForSelector('#btn--next', {timeout: 30000});
        await page.click('#btn--next');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});

        var open = await stored();
        expect(open.encrypt).toBe('0');
        expect(open.notes.filter(function(note) { return note.id === 'enc-1'; })[0].content)
            .toBe(seeded[0].content);
        expect(await readBack()).toEqual(expected);
    });

    // In the desktop window a link in a note must not replace the app
    // with a web page; it goes to the shell, which opens the browser.
    test('desktop links open outside the app', async function({page}) {
        await page.addInitScript(function() {
            window.__opened = [];
            window.__TAURI_INTERNALS__ = {
                invoke: function(cmd, args) {
                    if (cmd !== 'open_external') {
                        return Promise.reject(new Error('unexpected: ' + cmd));
                    }
                    window.__opened.push(args.url);
                    return Promise.resolve();
                }
            };
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await dismissWizard(page);

        await page.click('#header--add');
        await page.fill('#editor--input--title', 'Links');
        await page.waitForSelector('#editor .CodeMirror');
        await page.evaluate(function() {
            document.querySelector('#editor .CodeMirror').CodeMirror
                .setValue('[a site](https://example.org/page) and #sometag');
        });
        await page.click('.editor--save');
        await page.click('.list--item.-note >> nth=0');
        await page.waitForSelector('.content.-note .prose a');

        var before = page.url();
        await page.locator('.content.-note .prose a', {hasText: 'a site'}).click();
        expect(await page.evaluate(function() { return window.__opened; }))
            .toEqual(['https://example.org/page']);
        expect(page.url()).toBe(before);

        // links inside the app still work
        await page.locator('.content.-note .prose a', {hasText: '#sometag'}).click();
        await expect(page.locator('#header--title')).toHaveText('sometag');
        expect(await page.evaluate(function() { return window.__opened.length; })).toBe(1);
    });

    // "All my notes are gone" (gh-683, gh-670, gh-440): an address
    // naming a profile that does not exist used to create an empty
    // database and show an empty list, with nothing to say why.
    test('an unknown profile in the address shows the default profile', async function({page}) {
        await seedNotes(page, 3);

        // The app reloads itself when the profile in the address changes
        await page.goto('/#/p/ghost/notes').catch(function() {});
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        await expect(page.locator('.list--item.-note')).toHaveCount(3);
        expect(page.url()).not.toContain('/p/ghost');

        // and no database was made for it
        expect(await page.evaluate(async function() {
            return (await window.indexedDB.databases()).map(function(db) { return db.name; });
        })).not.toContain('ghost');

        // A profile that was made in settings still opens as itself
        await page.evaluate(async function() {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            await localforage.createInstance({name: 'notes-db', storeName: 'configs'})
                .setItem('appProfiles', {name: 'appProfiles', value: JSON.stringify(['notes-db', 'work'])});
        });
        await page.goto('/#/p/work/notes').catch(function() {});
        await page.waitForFunction(function() {
            return window.location.hash.indexOf('/p/work') !== -1 &&
                document.getElementById('header--count') &&
                document.getElementById('header--count').textContent === '0';
        }, null, {timeout: 20000});
        await expect(page.locator('.list--item.-note')).toHaveCount(0);
    });

    // ---- encryption: changing the password ----

    // Plain notes straight into the store
    async function seedPlainNotes(page, list) {
        await page.evaluate(async function(list) {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            var notes = localforage.createInstance({name: 'notes-db', storeName: 'notes'});
            for (var i = 0; i < list.length; i++) {
                await notes.setItem(list[i].id, {
                    id: list[i].id, type: 'notes', title: list[i].title,
                    content: list[i].content, tags: [],
                    taskAll: 0, taskCompleted: 0, created: Date.now() - i * 1000, updated: Date.now(),
                    notebookId: '0', isFavorite: 0, trash: 0, files: [],
                });
            }
        }, list);
        await page.reload();
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
    }

    // Every note as the app reads it, decrypted
    function decryptedNotes(page) {
        return page.evaluate(async function() {
            var Radio = window.requirejs('backbone.radio'),
                coll  = await Radio.request('notes', 'fetch', {profile: 'notes-db'});
            return (coll.fullCollection || coll).map(function(model) {
                return {id: model.id, title: model.get('title'), content: model.get('content')};
            }).sort(function(a, b) { return a.id < b.id ? -1 : 1; });
        });
    }

    async function unlock(page, password) {
        await page.waitForSelector('.-auth input[name="password"]', {timeout: 20000});
        await page.fill('.-auth input[name="password"]', password);
        await page.click('.-auth button[type="submit"]');
    }

    // Settings: type a password, save, answer the questions the
    // encryption screen asks, leave the backup screen.
    async function setPassword(page, newPassword, oldPassword) {
        await page.goto('/#/settings/encryption');
        await page.waitForSelector('#useEncryption');
        await page.check('#useEncryption');
        await page.fill('#encryptPass', newPassword);
        await page.click('.settings--save');
        await page.waitForSelector('#encryption-password input[name="password"]', {timeout: 20000});
        if (oldPassword) {
            await page.fill('#encryption-password input[name="oldpass"]', oldPassword);
        }
        await page.fill('#encryption-password input[name="password"]', newPassword);
        await page.click('#encryption-password input[type="submit"]');
    }

    async function leaveBackupScreen(page) {
        await page.waitForSelector('#btn--next', {timeout: 30000});
        await page.click('#btn--next');
    }

    // The rest of gh-992 (BACKLOG P0): a new password re-encrypts
    // every note. The notes must survive it, a wrong old password
    // must change nothing, and a change abandoned half way must be
    // finishable later.
    test('changing the encryption password keeps every note', async function({page}) {
        test.setTimeout(120000);

        var notes = [
            {id: 'pw-1', title: 'Unzipping', content: '### Unzipping\n\nRun `unzip -o file.zip`.\n\n#ops'},
            {id: 'pw-2', title: 'Unicode', content: 'Gr\u00fc\u00dfe, \u65e5\u672c\u8a9e, \ud83d\ude80, & < >.'},
        ];
        await seedPlainNotes(page, notes);

        await setPassword(page, 'first-pass');
        await leaveBackupScreen(page);
        await unlock(page, 'first-pass');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        expect(await decryptedNotes(page)).toEqual(notes);

        // Change it
        await setPassword(page, 'second-pass', 'first-pass');
        await leaveBackupScreen(page);

        // The old password is dead, the new one opens the same notes
        await unlock(page, 'first-pass');
        await page.waitForTimeout(2000);
        await expect(page.locator('.list--item.-note:visible')).toHaveCount(0);
        await unlock(page, 'second-pass');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        expect(await decryptedNotes(page)).toEqual(notes);

        // A wrong old password does not start the re-encryption
        await setPassword(page, 'third-pass', 'not-the-old-one');
        await page.waitForTimeout(3000);
        await expect(page.locator('#btn--next')).toHaveCount(0);
        await expect(page.locator('#encryption-password input[name="oldpass"]')).toBeVisible();

        // Give up there, come back in a new session: the app asks
        // again and the change can be finished
        await page.evaluate(function() { window.sessionStorage.clear(); });
        await page.goto('/#/notes');
        await page.reload();
        await page.waitForSelector('#encryption-password input[name="oldpass"]', {timeout: 20000});
        await page.fill('#encryption-password input[name="oldpass"]', 'second-pass');
        await page.fill('#encryption-password input[name="password"]', 'third-pass');
        await page.click('#encryption-password input[type="submit"]');
        await leaveBackupScreen(page);
        await unlock(page, 'third-pass');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        expect(await decryptedNotes(page)).toEqual(notes);
    });

    // The desktop webview has no download manager: a blob link does
    // nothing there, so exports and the encryption backup were lost
    // without a word. They go to the shell's save_file command.
    test('desktop exports go through the shell instead of a download', async function({page}) {
        await page.addInitScript(function() {
            window.__saved = [];
            window.__TAURI_INTERNALS__ = {
                invoke: function(cmd, payload, options) {
                    if (cmd !== 'save_file') {
                        return Promise.reject(new Error('unexpected: ' + cmd));
                    }
                    window.__saved.push({
                        isBytes : payload instanceof Uint8Array,
                        text    : new TextDecoder().decode(payload).slice(0, 2),
                        size    : payload.length,
                        name    : decodeURIComponent(options.headers['x-file-name']),
                    });
                    return Promise.resolve('/tmp/' + options.headers['x-file-name']);
                }
            };
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await dismissWizard(page);

        // Settings: a JSON file
        await page.goto('/#/settings/importExport');
        await page.waitForSelector('#do-export', {timeout: 20000});
        await page.click('#do-export');
        await expect.poll(function() {
            return page.evaluate(function() { return window.__saved.length; });
        }).toBe(1);

        // Everything: a zip
        await page.click('#export-data');
        await expect.poll(function() {
            return page.evaluate(function() { return window.__saved.length; });
        }, {timeout: 20000}).toBe(2);

        var saved = await page.evaluate(function() { return window.__saved; });
        expect(saved[0].name).toBe('seshat-settings.json');
        expect(saved[0].isBytes).toBe(true);
        expect(saved[0].size).toBeGreaterThan(10);
        expect(saved[1].name).toMatch(/\.zip$/);
        expect(saved[1].text).toBe('PK');
    });

    // Vault importer: stubbed Tauri scan must interpolate the summary
    // counts (i18n.t without values blanks {{...}} placeholders).
    test('vault import reports interpolated counts', async function({page}) {
        await page.addInitScript(function() {
            window.__TAURI_INTERNALS__ = {
                invoke: function(cmd) {
                    if (cmd !== 'import_vault') {
                        return Promise.reject(new Error('unexpected: ' + cmd));
                    }
                    return Promise.resolve({
                        root: '/vault',
                        files: [
                            {path: 'Welcome.md', content: '# Welcome\n\nSee [[Missing]] and [[Second]].'},
                            {path: 'Diary/Second.md', content: '# Titled\n\nbody here'},
                        ],
                        skipped: ['pic.png'],
                    });
                }
            };
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await dismissWizard(page);
        await page.goto('/#/settings/importExport');
        await page.waitForSelector('#do-import-vault', {timeout: 20000});
        await page.click('#do-import-vault');
        var modal = page.locator('#modal');
        await expect(modal).toContainText('2 notes in 1 notebooks (1 skipped)', {timeout: 30000});
        await expect(modal).toContainText('1 wikilinks left as text');
        await modal.locator('button[data-event="confirm"]').click();
        await page.goto('/#/notes');
        await page.waitForSelector('#header--add', {timeout: 20000});
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        await expect(page.locator('.list--item--title').filter({hasText: 'Welcome'})).toHaveCount(1);
        await expect(page.locator('.list--item--title').filter({hasText: 'Second'})).toHaveCount(1);
    });

    // The import is a one-time copy: running it again on the same
    // vault must not double every note.
    test('importing the same vault twice adds nothing the second time', async function({page}) {
        await page.addInitScript(function() {
            window.__TAURI_INTERNALS__ = {
                invoke: function(cmd) {
                    if (cmd !== 'import_vault') {
                        return Promise.reject(new Error('unexpected: ' + cmd));
                    }
                    return Promise.resolve({
                        root: '/vault',
                        files: [
                            {path: 'Welcome.md', content: '# Welcome\n\nSee [[Second]] & <b>bold</b> "quotes".', mtime: 1700000000000},
                            {path: 'Diary/Second.md', content: 'body here #tagged', mtime: 1700000100000},
                        ],
                        skipped: [],
                    });
                }
            };
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await dismissWizard(page);

        async function importVault() {
            await page.goto('/#/settings/importExport');
            await page.waitForSelector('#do-import-vault', {timeout: 20000});
            await page.click('#do-import-vault');
            var modal = page.locator('#modal');
            await expect(modal).toContainText('notes in', {timeout: 30000});
            var text = await modal.textContent();
            // the dialog reloads the app when it is closed
            await modal.locator('button[data-event="confirm"]').click();
            await page.waitForSelector('#modal .modal-dialog', {state: 'detached', timeout: 20000});
            await page.waitForSelector('#do-import-vault', {timeout: 20000});
            return text;
        }

        expect(await importVault()).toContain('2 notes in 1 notebooks');

        var again = await importVault();
        expect(again).toContain('0 notes in');
        expect(again).toContain('2 already here');

        await page.goto('/#/notes');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
        await expect(page.locator('.list--item.-note')).toHaveCount(2);
    });
});
