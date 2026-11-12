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

var runner, localforage;

beforeAll(async function() {
    var mods = await load(['modules/importExport/vault/runner', 'localforage']);
    runner = mods[0];
    localforage = mods[1];
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

    it('reports cancellation as cancelled, not an error', async function() {
        var summary = await runner.run(
            function() { return Promise.resolve(null); },
            makeWriter(localforage, 'import-test-cancel'),
            {}
        );
        expect(summary.cancelled).toBe(true);
    });
});
