/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import 'fake-indexeddb/auto';
import {load} from '../helpers/amd.js';

global.window = global;
global.Modernizr = {indexeddb: true};

var Migrate, localforage;

function openRaw(names) {
    return new Promise(function(resolve, reject) {
        var req = global.indexedDB.open('notes-db', 1);
        req.onupgradeneeded = function() {
            // No keyPath: legacy stores used out-of-line keys, which is
            // also the layout localforage expects (store.put(value, key)).
            names.forEach(function(n) {
                req.result.createObjectStore(n);
            });
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function putRaw(db, store, records) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction([store], 'readwrite'),
            os = tx.objectStore(store);
        records.forEach(function(r) { os.put(r, r.id); });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
    });
}

beforeAll(async function() {
    var mods = await load(['helpers/migrate', 'localforage']);
    Migrate = mods[0];
    localforage = mods[1];
});

describe('migrate helper', function() {

    it('migrates legacy raw-IndexedDB records into localforage', async function() {
        var db = await openRaw(['notes', 'notebooks']);
        // v0.7.51-era shape: numeric ids, numeric notebookId.
        await putRaw(db, 'notes', [{
            id: 1, title: 'legacy', content: 'body',
            notebookId: 2, tags: [], trash: 0,
        }]);
        await putRaw(db, 'notebooks', [{id: 2, name: 'nb'}]);
        db.close();

        await new Migrate().start();

        var notes = localforage.createInstance({name: 'notes-db', storeName: 'notes'}),
            item  = await notes.getItem('1');
        expect(item.title).toBe('legacy');
        expect(item.id).toBe('1');
        expect(item.notebookId).toBe('2');
        expect(item.type).toBe('notes');
        expect(item.trash).toBe(0);
        expect(item.created).toBeGreaterThan(0);

        var notebooks = localforage.createInstance({name: 'notes-db', storeName: 'notebooks'}),
            nb = await notebooks.getItem('2');
        expect(nb.name).toBe('nb');
        expect(nb.id).toBe('2');
    });

    it('resolves quietly when there is nothing to migrate', async function() {
        await expect(new Migrate().start()).resolves.toBeUndefined();
    });
});
