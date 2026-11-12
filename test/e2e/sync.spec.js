/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
const {test, expect} = require('@playwright/test');

/**
 * Sync, through the real app: store, crypto, engine and runner.
 *
 * Only the desktop shell is stood in for. Each "device" is its own
 * browser context with its own storage; its shell stub keeps a mirror
 * folder and answers `sync_transfer` the way rsync does (copy what
 * differs, delete nothing) against one remote folder shared by the
 * test. The Rust side has its own tests with the real rsync.
 */
function shellStub() {
    function mirror() {
        try { return JSON.parse(window.localStorage.getItem('test.mirror')) || {}; }
        catch (e) { return {}; }
    }
    function save(files) {
        window.localStorage.setItem('test.mirror', JSON.stringify(files));
    }
    var synced = ['notes', 'notebooks', 'tags', 'profile'];

    window.__transfers = [];
    window.__TAURI_INTERNALS__ = {
        invoke: async function(cmd, args) {
            var files = mirror(), prefix;

            if (cmd === 'sync_list') {
                prefix = args.profile + '/' + args.store + '/';
                return Object.keys(files).filter(function(p) { return p.indexOf(prefix) === 0; })
                    .map(function(p) { return {name: p.slice(prefix.length), size: files[p].length, mtime: 1}; });
            }
            if (cmd === 'sync_read') {
                prefix = args.profile + '/' + args.store + '/';
                return args.names.filter(function(n) { return files[prefix + n] !== undefined; })
                    .map(function(n) { return {name: n, content: files[prefix + n]}; });
            }
            if (cmd === 'sync_write') {
                prefix = args.profile + '/' + args.store + '/';
                args.files.forEach(function(f) { files[prefix + f.name] = f.content; });
                save(files);
                return args.files.length;
            }
            if (cmd === 'sync_transfer') {
                window.__transfers.push(args.direction + ' ' + args.remote + ' ' + args.port);
                if (window.__offline) {
                    return {ok: false, step: args.direction === 'pull' ? 'prepare' : 'push', message: 'ssh: connect to host: Network is unreachable'};
                }
                var remote = JSON.parse(await window.__remoteRead());
                var mine = function(p) {
                    return synced.some(function(s) { return p.indexOf(args.profile + '/' + s + '/') === 0; });
                };
                if (args.direction === 'pull') {
                    Object.keys(remote).filter(mine).forEach(function(p) { files[p] = remote[p]; });
                    save(files);
                }
                else {
                    var up = {};
                    Object.keys(files).filter(mine).forEach(function(p) { up[p] = files[p]; });
                    await window.__remoteWrite(JSON.stringify(up));
                }
                return {ok: true, step: args.direction, message: ''};
            }
            throw new Error('unexpected command: ' + cmd);
        }
    };
}

test.describe('sync', function() {
    let remote, errors, expected;

    async function device(browser, baseURL, name) {
        var context = await browser.newContext({baseURL: baseURL}),
            page    = await context.newPage();

        await context.exposeFunction('__remoteRead', function() { return JSON.stringify(remote); });
        await context.exposeFunction('__remoteWrite', function(json) { Object.assign(remote, JSON.parse(json)); });
        await context.addInitScript(shellStub);

        page.on('pageerror', function(e) { errors.push(name + ': ' + String(e)); });
        page.on('console', function(msg) {
            // a failed sync is reported on the console by design
            var text = msg.text();
            if (msg.type() === 'error' && text.indexOf('Sync:') !== 0 &&
                !expected.some(function(start) { return text.indexOf(start) === 0; })) {
                errors.push(name + ': ' + msg.text());
            }
        });

        await page.goto('/');
        await page.waitForSelector('#header--add', {timeout: 20000});

        // Past the first-run wizard, with sync pointed at the remote
        await page.evaluate(async function() {
            var localforage = await new Promise(function(resolve, reject) {
                window.requirejs(['localforage'], function(lf) { resolve(lf); }, reject);
            });
            await localforage.createInstance({name: 'notes-db', storeName: 'notebooks'}).setItem('seed-nb', {
                id: 'seed-nb', type: 'notebooks', parentId: '0', name: 'seed', count: 0, trash: 0, created: 1, updated: 1,
            });
            var configs = localforage.createInstance({name: 'notes-db', storeName: 'configs'});
            await configs.setItem('cloudStorage', {name: 'cloudStorage', value: 'rsync'});
            await configs.setItem('syncRemote', {name: 'syncRemote', value: 'box@storage.example:seshat'});
            await configs.setItem('syncPort', {name: 'syncPort', value: '23'});
        });
        await page.reload();
        await page.waitForSelector('#header--add', {timeout: 20000});
        await page.waitForFunction(function() { return window.requirejs.defined('modules/sync/module'); });

        return page;
    }

    function sync(page) {
        return page.evaluate(function() {
            var Radio = window.requirejs('backbone.radio');
            return new Promise(function(resolve) {
                Radio.request('sync', 'start').then(function(summary) {
                    resolve(summary || Radio.request('sync', 'status'));
                });
            });
        });
    }

    function write(page, id, title, content) {
        return page.evaluate(async function(args) {
            var Radio = window.requirejs('backbone.radio'),
                model = await Radio.request('notes', 'get:model', {id: args.id, profile: 'notes-db'});
            if (!model || !model.get('created')) {
                // a new note with a chosen id
                model = await Radio.request('notes', 'get:model', {profile: 'notes-db'});
                model.set('id', args.id);
            }
            await Radio.request('notes', 'save', model, {title: args.title, content: args.content});
        }, {id: id, title: title, content: content});
    }

    function notes(page) {
        return page.evaluate(async function() {
            var Radio = window.requirejs('backbone.radio'),
                coll  = await Radio.request('notes', 'fetch', {profile: 'notes-db'});
            return (coll.fullCollection || coll).filter(function(m) { return m.get('trash') === 0; })
                .map(function(m) { return m.get('title') + ' = ' + m.get('content'); }).sort();
        });
    }

    async function encrypt(page, pass) {
        await page.goto('/#/settings/encryption');
        await page.waitForSelector('#useEncryption');
        await page.check('#useEncryption');
        await page.fill('#encryptPass', pass);
        await page.click('.settings--save');
        await page.waitForSelector('#encryption-password input[name="password"]', {timeout: 20000});
        await page.fill('#encryption-password input[name="password"]', pass);
        await page.click('#encryption-password input[type="submit"]');
        await page.waitForSelector('#btn--next', {timeout: 30000});
        await page.click('#btn--next');
        await page.waitForSelector('.-auth input[name="password"]', {timeout: 20000});
        await page.fill('.-auth input[name="password"]', pass);
        await page.click('.-auth button[type="submit"]');
        await page.waitForSelector('.list--item.-note', {timeout: 20000});
    }

    test.beforeEach(function() {
        remote = {};
        errors = [];
        // console errors a test provokes on purpose
        expected = [];
    });

    test.afterEach(function() {
        expect(errors).toEqual([]);
    });

    test('a note written on one device arrives on the other, and edits travel back', async function({browser}, testInfo) {
        var base = testInfo.project.use.baseURL,
            a = await device(browser, base, 'a'),
            b = await device(browser, base, 'b');

        await write(a, 'n1', 'Shared', 'written on a');
        await a.evaluate(function() {
            return window.requirejs('backbone.radio').request('tags', 'add', ['errands'], {profile: 'notes-db'});
        });
        expect(await sync(a)).toMatchObject({pushed: expect.any(Number), conflicts: 0});
        expect(Object.keys(remote).filter(function(p) { return p.indexOf('/tags/') !== -1; })).toHaveLength(1);

        // rsync was pointed where the settings say
        expect(await a.evaluate(function() { return window.__transfers[0]; }))
            .toBe('pull box@storage.example:seshat 23');
        expect(Object.keys(remote)).toContain('notes-db/notes/n1.json');

        await sync(b);
        expect(await notes(b)).toEqual(['Shared = written on a']);
        // and it is in the list without a reload
        await expect(b.locator('.list--item--title', {hasText: 'Shared'})).toHaveCount(1);

        await write(b, 'n1', 'Shared', 'edited on b');
        await sync(b);
        await sync(a);
        expect(await notes(a)).toEqual(['Shared = edited on b']);

        // nothing left to do on either side
        expect(await sync(a)).toMatchObject({pulled: 0, pushed: 0, conflicts: 0});
        expect(await sync(b)).toMatchObject({pulled: 0, pushed: 0, conflicts: 0});

        await a.context().close();
        await b.context().close();
    });

    test('a note edited on both devices is kept twice, never overwritten', async function({browser}, testInfo) {
        var base = testInfo.project.use.baseURL,
            a = await device(browser, base, 'a'),
            b = await device(browser, base, 'b');

        await write(a, 'n1', 'Plan', 'first draft');
        await sync(a);
        await sync(b);

        await write(a, 'n1', 'Plan', 'a rewrote it');
        await write(b, 'n1', 'Plan', 'b rewrote it too');
        await sync(a);
        expect(await sync(b)).toMatchObject({conflicts: 1});

        expect(await notes(b)).toEqual([
            'Plan (conflict copy) = b rewrote it too',
            'Plan = a rewrote it',
        ]);

        // the copy is an ordinary note: it reaches the other device
        await sync(b);
        await sync(a);
        expect(await notes(a)).toEqual(await notes(b));
        expect(await sync(a)).toMatchObject({pulled: 0, pushed: 0, conflicts: 0});

        await a.context().close();
        await b.context().close();
    });

    test('with encryption on, only ciphertext reaches the remote', async function({browser}, testInfo) {
        test.setTimeout(120000);
        var a = await device(browser, testInfo.project.use.baseURL, 'a');

        await write(a, 'secret', 'Bank details', 'the combination is 4-8-15-16');

        await encrypt(a, 'sync-pass');
        await a.evaluate(function() {
            return window.requirejs('backbone.radio').request('tags', 'add', ['finance'], {profile: 'notes-db'});
        });

        await sync(a);

        // a tag's file name is a hash of its name: tags stay home
        expect(Object.keys(remote).filter(function(p) { return p.indexOf('/tags/') !== -1; })).toEqual([]);

        var file = remote['notes-db/notes/secret.json'];
        expect(file).toBeTruthy();
        expect(file).not.toContain('Bank details');
        expect(file).not.toContain('combination');
        expect(file).not.toContain('sync-pass');
        expect(JSON.parse(file).record.encryptedData).toBeTruthy();
        // an encrypted record keeps its fields, emptied
        expect(JSON.parse(file).record.title || '').toBe('');
        expect(JSON.parse(file).record.content || '').toBe('');

        // and the whole remote, not just that file
        expect(JSON.stringify(remote)).not.toContain('4-8-15-16');

        await a.context().close();
    });

    test('a failed transfer changes nothing and the next run catches up', async function({browser}, testInfo) {
        var base = testInfo.project.use.baseURL,
            a = await device(browser, base, 'a'),
            b = await device(browser, base, 'b');

        await write(a, 'n1', 'Offline', 'written while the box was away');
        await a.evaluate(function() { window.__offline = true; });

        var failed = await sync(a);
        expect(failed).toMatchObject({ok: false});
        expect(failed.message).toContain('unreachable');
        expect(Object.keys(remote)).toEqual([]);
        expect(await notes(a)).toEqual(['Offline = written while the box was away']);

        await a.evaluate(function() { window.__offline = false; });
        expect(await sync(a)).toMatchObject({conflicts: 0});
        await sync(b);
        expect(await notes(b)).toEqual(['Offline = written while the box was away']);
        // no copy was made of a note nobody else touched
        expect(await sync(a)).toMatchObject({pulled: 0, pushed: 0, conflicts: 0});
        expect(await notes(a)).toEqual(['Offline = written while the box was away']);

        await a.context().close();
        await b.context().close();
    });

    test('a device that cannot read the encrypted notes takes nothing and sends nothing', async function({browser}, testInfo) {
        test.setTimeout(180000);
        var base = testInfo.project.use.baseURL,
            a = await device(browser, base, 'a'),
            b = await device(browser, base, 'b'),
            c = await device(browser, base, 'c');

        await write(a, 'secret', 'Bank details', 'the combination is 4-8-15-16');
        await encrypt(a, 'sync-pass');
        await sync(a);
        var before = JSON.stringify(remote);

        // encryption off here
        await write(b, 'mine', 'Shopping', 'in the clear');
        var refused = await sync(b);
        expect(refused).toMatchObject({ok: false, step: 'read'});
        expect(refused.message).toContain('encryption is off');
        expect(await notes(b)).toEqual(['Shopping = in the clear']);
        expect(JSON.stringify(remote)).toBe(before);

        // encryption on here, but set up separately: another salt, another key
        expected.push('Decryption error');
        await write(c, 'other', 'Diary', 'sealed with my own key');
        await encrypt(c, 'sync-pass');
        refused = await sync(c);
        expect(refused).toMatchObject({ok: false, step: 'read'});
        expect(refused.message).toContain('different password');
        expect(await notes(c)).toEqual(['Diary = sealed with my own key']);
        expect(JSON.stringify(remote)).toBe(before);

        await a.context().close();
        await b.context().close();
        await c.context().close();
    });
});
