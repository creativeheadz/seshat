/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'underscore'
], function(_) {
    'use strict';

    /**
     * Tags as they are written in a note's text.
     *
     * The page links `#word` when the hash starts a line or follows
     * white space and runs up to the next white space (the rule
     * given to markdown-it-hashtag in modules/markdown). A note's
     * `tags` field is filled from that when it is saved in the
     * editor, so anything that reached the store another way (a
     * vault import, an old backup) can have tags in its text and
     * none in the field. These helpers read the text itself.
     *
     * Code is skipped: `#include` in a fence is not a tag.
     */
    function prose(content) {
        return String(content || '')
        .replace(/```[\s\S]*?(```|$)/g, ' ')
        .replace(/~~~[\s\S]*?(~~~|$)/g, ' ')
        .replace(/`[^`\n]*`/g, ' ');
    }

    var Hashtags = {

        /**
         * Every tag in the text: lower case, no hash, no repeats.
         */
        extract: function(content) {
            var pattern = /(^|\s)#([^\s#][^\s]*)/g,
                text    = prose(content),
                tags    = [],
                match;

            while ((match = pattern.exec(text)) !== null) {
                tags.push(match[2].toLowerCase());
            }

            return _.uniq(tags);
        },

        /**
         * Whether the text carries the tag.
         */
        has: function(content, tag) {
            if (!tag || String(content || '').indexOf('#') === -1) {
                return false;
            }
            return _.contains(Hashtags.extract(content), String(tag).toLowerCase());
        }
    };

    return Hashtags;
});
