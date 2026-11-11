/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
const {test, expect} = require('@playwright/test');
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
        var wizard = page.locator('#modal:has-text("Welcome to Laverna")');
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
});
