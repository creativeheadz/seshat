/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import {load} from '../helpers/amd.js';

var hashtags, mapper;

beforeAll(async function() {
    var mods = await load(['helpers/hashtags', 'modules/importExport/vault/mapper']);
    hashtags = mods[0];
    mapper = mods[1];
});

describe('hashtags in note text', function() {

    it('reads tags at line start or after white space, lower-cased, once each', function() {
        expect(hashtags.extract('#First line\n**Tags:** #database #Device-Summary #database'))
            .toEqual(['first', 'database', 'device-summary']);
    });

    it('does not take headings, fragments or double hashes for tags', function() {
        expect(hashtags.extract('# Heading\n## Another\nsee https://example.org/#part and ##nope')).toEqual([]);
    });

    it('skips code', function() {
        expect(hashtags.extract('a #real tag\n\n```c\n#include <stdio.h>\n```\n\nand `#inline` code'))
            .toEqual(['real']);
    });

    it('answers whether a text carries a tag', function() {
        expect(hashtags.has('notes on #Dashboard design', 'dashboard')).toBe(true);
        expect(hashtags.has('notes on #dashboards', 'dashboard')).toBe(false);
        expect(hashtags.has('no tags here', 'dashboard')).toBe(false);
    });

    // Imported notes used to keep only frontmatter tags, so clicking a
    // tag written in the text listed nothing.
    it('vault import keeps tags from frontmatter and from the text', function() {
        var note = mapper.mapNote({
            path: 'a.md',
            content: '---\ntags: [SQL, reporting]\n---\n**Tags:** #reporting #dashboard',
        });
        expect(note.tags).toEqual(['sql', 'reporting', 'dashboard']);
    });
});
