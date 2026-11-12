/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import 'fake-indexeddb/auto';
import path from 'path';
import {load} from '../helpers/amd.js';
import {makeNodeSource, makeWriter} from '../helpers/vaultNode.js';

global.window = global;

var runner, localforage, mapper;

beforeAll(async function() {
    var mods = await load([
        'modules/importExport/vault/runner', 'localforage',
        'modules/importExport/vault/mapper',
    ]);
    runner = mods[0];
    localforage = mods[1];
    mapper = mods[2];
});

describe('vault pipeline', function() {

    it('imports a fixture vault end to end', async function() {
        var dir = path.join(__dirname, '..', 'fixtures', 'vault'),
            progress = [],
            summary = await runner.run(
                makeNodeSource(dir),
                makeWriter(localforage, 'import-test'),
                {
                    batchSize: 2,
                    onProgress: function(state) { progress.push(state); },
                }
            );

        expect(summary.notes).toBe(4);
        expect(summary.notebooks).toBe(2);
        expect(summary.skipped).toBe(2);
        expect(progress.length).toBeGreaterThan(0);
        expect(progress[progress.length - 1]).toEqual({done: 4, total: 4});

        var notes = localforage.createInstance({name: 'import-test', storeName: 'notes'}),
            notebooks = localforage.createInstance({name: 'import-test', storeName: 'notebooks'});

        async function allItems(instance) {
            var keys = await instance.keys();
            return Promise.all(keys.map(function(k) { return instance.getItem(k); }));
        }

        function byTitle(items, title) {
            return items.filter(function(n) { return n.title === title; })[0];
        }

        var allNotes = await allItems(notes),
            welcome  = byTitle(allNotes, 'Welcome'),
            second   = byTitle(allNotes, 'Second Note'),
            dated    = byTitle(allNotes, '2024-01-01');

        expect(welcome.content).toMatch(/\(#\/notes\/show\/[0-9a-f-]{36}\)/);
        expect(welcome.content).toContain('**Missing**');
        expect(welcome.content).toContain('![[pic.png]]');
        expect(second.tags).toEqual(['alpha', 'beta']);

        var allNb = await allItems(notebooks),
            diary = allNb.filter(function(nb) { return nb.name === 'Diary'; })[0],
            sub   = allNb.filter(function(nb) { return nb.name === 'Sub'; })[0];
        expect(diary.parentId).toBe('0');
        expect(sub.parentId).toBe(diary.id);
        expect(dated.notebookId).toBe(diary.id);
        expect(dated.tags).toEqual(['journal', '2024']);
    });

    // The import is a one-time copy; doing it twice must not double
    // every note.
    it('a second import of the same vault adds nothing', async function() {
        var dir = path.join(__dirname, '..', 'fixtures', 'vault'),
            notes = localforage.createInstance({name: 'import-twice', storeName: 'notes'});

        var first = await runner.run(
            makeNodeSource(dir), makeWriter(localforage, 'import-twice', mapper), {}
        );
        expect(first.notes).toBe(4);
        expect(first.duplicates).toBe(0);
        expect((await notes.keys()).length).toBe(4);

        var second = await runner.run(
            makeNodeSource(dir), makeWriter(localforage, 'import-twice', mapper), {}
        );
        expect(second.notes).toBe(0);
        expect(second.duplicates).toBe(4);
        expect((await notes.keys()).length).toBe(4);
    });

    // A file that changed since the first import is a new note, and
    // its links to notes already here point at the ones that are here.
    it('a later import adds only what is new and links to what is here', async function() {
        var notes = localforage.createInstance({name: 'import-later', storeName: 'notes'});

        function source(files) {
            return function() { return Promise.resolve({files: files, skipped: []}); };
        }

        await runner.run(source([
            {path: 'A.md', content: 'first text'},
        ]), makeWriter(localforage, 'import-later', mapper), {});
        var keys = await notes.keys(),
            a    = await notes.getItem(keys[0]);

        var summary = await runner.run(source([
            {path: 'A.md', content: 'first text'},
            {path: 'B.md', content: 'see [[A]]'},
        ]), makeWriter(localforage, 'import-later', mapper), {});

        expect(summary.notes).toBe(1);
        expect(summary.duplicates).toBe(1);

        var all = await Promise.all((await notes.keys()).map(function(k) { return notes.getItem(k); })),
            b   = all.filter(function(n) { return n.title === 'B'; })[0];
        expect(all.length).toBe(2);
        expect(b.content).toBe('see [A](#/notes/show/' + a.id + ')');
    });

    it('reports cancellation as cancelled, not an error', async function() {
        var summary = await runner.run(
            function() { return Promise.resolve(null); },
            makeWriter(localforage, 'import-test-cancel'),
            {}
        );
        expect(summary.cancelled).toBe(true);
    });
});
