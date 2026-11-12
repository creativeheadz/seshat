/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
'use strict';

// Node implementations of the vault pipeline's injected seams, so the
// full runner is integration-tested without Tauri or the app stack.
// Walk rules mirror src-tauri/src/lib.rs (keep in sync).

var fs   = require('fs'),
    path = require('path');

var SKIP_DIRS = ['.obsidian', '.git', '.trash', 'node_modules'];

function isMarkdown(name) {
    return /\.(md|markdown)$/i.test(name);
}

function walk(dir, root, files, skipped) {
    fs.readdirSync(dir, {withFileTypes: true})
    .sort(function(a, b) { return a.name < b.name ? -1 : 1; })
    .forEach(function(entry) {
        var full = path.join(dir, entry.name),
            rel  = path.relative(root, full).split(path.sep).join('/');

        if (entry.isDirectory()) {
            if (SKIP_DIRS.indexOf(entry.name) === -1) {
                walk(full, root, files, skipped);
            }
            return;
        }

        if (isMarkdown(entry.name)) {
            files.push({path: rel, content: fs.readFileSync(full, 'utf8')});
        }
        else if (entry.name[0] !== '.') {
            skipped.push(rel);
        }
    });
}

function makeNodeSource(dir) {
    return function() {
        var files = [],
            skipped = [];
        walk(dir, dir, files, skipped);
        return Promise.resolve({files: files, skipped: skipped});
    };
}

// Writer straight to localforage (fake-indexeddb under Vitest).
// Pass the mapper to give it existing(), as the app's writer has.
function makeWriter(localforage, profile, mapper) {
    var notes = localforage.createInstance({name: profile, storeName: 'notes'}),
        notebooks = localforage.createInstance({name: profile, storeName: 'notebooks'});

    function allNotebooks() {
        return notes.keys().then(function() {
            return notebooks.keys();
        })
        .then(function(keys) {
            return Promise.all(keys.map(function(key) {
                return notebooks.getItem(key);
            }));
        });
    }

    return {
        findNotebook: function(name, parentId) {
            return allNotebooks().then(function(all) {
                var found = all.filter(function(nb) {
                    return nb && nb.name === name && nb.parentId === parentId;
                })[0];
                return found ? found.id : null;
            });
        },

        saveNotebook: function(attrs) {
            return notebooks.setItem(attrs.id, attrs).then(function() {
                return attrs.id;
            });
        },

        saveNote: function(attrs) {
            return notes.setItem(attrs.id, attrs);
        },

        existing: function() {
            if (!mapper) {
                return Promise.resolve({});
            }
            return notes.keys().then(function(keys) {
                return Promise.all(keys.map(function(key) { return notes.getItem(key); }));
            })
            .then(function(all) {
                var map = {};
                all.forEach(function(note) {
                    map[mapper.fingerprint(note.title, note.content)] = note.id;
                });
                return map;
            });
        },
    };
}

module.exports = {makeNodeSource: makeNodeSource, makeWriter: makeWriter};
