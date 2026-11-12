/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import {load} from '../helpers/amd.js';

var mapper;

beforeAll(async function() {
    var mods = await load(['modules/importExport/vault/mapper']);
    mapper = mods[0];
});

describe('vault mapper', function() {

    it('parses scalar, flow-list and block-list frontmatter', function() {
        var parsed = mapper.parseFrontmatter(
            '---\ntitle: "Hi"\ntags: [a, B]\nlist:\n  - x\n  - y\n---\nBody'
        );
        expect(parsed.attrs).toEqual({title: 'Hi', tags: ['a', 'B'], list: ['x', 'y']});
        expect(parsed.body).toBe('Body');
    });

    it('leaves text without frontmatter untouched', function() {
        var parsed = mapper.parseFrontmatter('# No fence here');
        expect(parsed.attrs).toEqual({});
        expect(parsed.body).toBe('# No fence here');
    });

    it('prefers frontmatter title, falls back to filename', function() {
        expect(mapper.mapNote({path: 'a.md', content: '---\ntitle: T\n---\nx'}).title).toBe('T');
        expect(mapper.mapNote({path: 'dir/my-note.md', content: 'x'}).title).toBe('my-note');
    });

    it('maps folders to notebook paths, root to none', function() {
        expect(mapper.mapNote({path: 'a.md', content: 'x'}).notebookPath).toEqual([]);
        expect(mapper.mapNote({path: 'A/B/c.md', content: 'x'}).notebookPath)
            .toEqual(['A', 'B']);
    });

    it('normalizes tags to lowercase uniq', function() {
        expect(mapper.normalizeTags(['B', 'b', ' a '])).toEqual(['b', 'a']);
        expect(mapper.normalizeTags('#Solo')).toEqual(['solo']);
        expect(mapper.normalizeTags(undefined)).toEqual([]);
    });

    it('mints unique uuid-shaped ids', function() {
        var ids = {};
        for (var i = 0; i < 200; i++) {
            var id = mapper.mintId();
            expect(id).toMatch(/^[0-9a-f-]{36}$/);
            ids[id] = true;
        }
        expect(Object.keys(ids).length).toBe(200);
    });

    it('resolves wikilinks, labels, sections; bolds the rest', function() {
        var index = mapper.buildTitleIndex([
            {title: 'Second', id: 'id-2'},
            {title: 'Welcome', id: 'id-1'},
        ]);
        var out = mapper.rewriteWikilinks(
            'See [[Second]] and [[Welcome|back]] and [[Nope]] and [[A#b|c]].',
            index
        );
        expect(out.text).toBe(
            'See [Second](#/notes/show/id-2) and [back](#/notes/show/id-1)' +
            ' and **Nope** and **c**.'
        );
        expect(out.resolved).toBe(2);
        expect(out.unresolved).toBe(2);
    });

    it('leaves embeds literal and counts them', function() {
        var out = mapper.rewriteWikilinks('![[pic.png]]', {});
        expect(out.text).toBe('![[pic.png]]');
        expect(out.embeds).toBe(1);
    });
});
