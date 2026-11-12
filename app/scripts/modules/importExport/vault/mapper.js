/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'underscore',
    'helpers/hashtags'
], function(_, Hashtags) {
    'use strict';

    /**
     * Pure mapping from Obsidian vault files to note attributes.
     * No Radio, no DOM: fully unit-testable.
     */
    function stripQuotes(str) {
        str = str.trim();
        if ((str[0] === '"' && str[str.length - 1] === '"') ||
            (str[0] === '\'' && str[str.length - 1] === '\'')) {
            return str.slice(1, -1);
        }
        return str;
    }

    function parseList(str) {
        str = str.trim();
        if (str[0] === '[' && str[str.length - 1] === ']') {
            return _.map(str.slice(1, -1).split(','), function(item) {
                return stripQuotes(item);
            });
        }
        return [stripQuotes(str)];
    }

    var mapper = {

        /**
         * Parse a minimal YAML frontmatter subset (scalars, flow
         * lists, one-level block lists). Returns {attrs, body}.
         */
        parseFrontmatter: function(text) {
            var result = {attrs: {}, body: text},
                end,
                lines,
                currentKey = null;

            if (text.slice(0, 4) !== '---\n' && text.slice(0, 4) !== '---\r') {
                return result;
            }

            end = text.indexOf('\n---', 3);
            if (end === -1) {
                return result;
            }

            lines = text.slice(4, end).split('\n');
            _.each(lines, function(line) {
                var item = line.match(/^\s*-\s+(.*)$/),
                    pair;

                if (item && currentKey) {
                    result.attrs[currentKey].push(stripQuotes(item[1]));
                    return;
                }

                pair = line.match(/^([\w-]+)\s*:\s*(.*)$/);
                if (!pair) {
                    currentKey = null;
                    return;
                }

                if (pair[2] === '') {
                    currentKey = pair[1];
                    result.attrs[currentKey] = [];
                }
                else if (pair[2][0] === '[') {
                    currentKey = null;
                    result.attrs[pair[1]] = parseList(pair[2]);
                }
                else {
                    currentKey = null;
                    result.attrs[pair[1]] = stripQuotes(pair[2]);
                }
            });

            result.body = text.slice(end + 4).replace(/^\r?\n/, '');
            return result;
        },

        fileTitle: function(relPath, attrs) {
            if (attrs.title) {
                return String(attrs.title);
            }
            var base = relPath.split('/').pop();
            return base.replace(/\.(md|markdown)$/i, '') || 'Untitled';
        },

        notebookPath: function(relPath) {
            var parts = relPath.split('/').slice(0, -1);
            return _.filter(parts, function(part) {
                return part && part !== '.';
            });
        },

        normalizeTags: function(raw) {
            var tags = _.isArray(raw) ? raw.slice() :
                (_.isUndefined(raw) || raw === null || raw === '' ? [] :
                String(raw).split(','));

            return _.chain(tags)
            .map(function(tag) {
                return String(tag).trim().toLowerCase()
                .replace(/^#/, '');
            })
            .filter(function(tag) {
                return tag.length > 0;
            })
            .uniq()
            .value();
        },

        mintId: function() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16).substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        },

        mapNote: function(file) {
            var parsed = this.parseFrontmatter(file.content),
                title  = this.fileTitle(file.path, parsed.attrs);

            return {
                path         : file.path,
                title        : title.length ? title : 'Untitled',
                content      : parsed.body,
                notebookPath : this.notebookPath(file.path),
                // Frontmatter tags plus the ones written in the text
                tags         : _.union(
                    this.normalizeTags(parsed.attrs.tags),
                    Hashtags.extract(parsed.body)
                ),
                created      : file.mtime || Date.now(),
            };
        },

        /**
         * What makes two notes the same note, for telling that a
         * vault was imported before: its title and its text.
         *
         * Links between notes are left out of the comparison, since
         * each import mints new ids for them, and so are white space
         * and the entity escaping the store applies. Nothing is kept
         * on the note to mark where it came from: with encryption on
         * that would be a file name sitting in plain text.
         */
        fingerprint: function(title, content) {
            function plain(str) {
                return _.unescape(_.unescape(String(str || '')))
                .replace(/\]\(#\/notes\/show\/[^)]*\)/g, ']()')
                .replace(/\s+/g, ' ')
                .trim();
            }

            return plain(title) + '\n' + plain(content);
        },

        buildTitleIndex: function(specs) {
            var index = {};
            _.each(specs, function(spec) {
                // Obsidian matches links by filename; titles win ties.
                var names = [spec.title, (spec.path || '').split('/').pop()
                    .replace(/\.(md|markdown)$/i, '')];
                _.each(names, function(name) {
                    var key = (name || '').trim().toLowerCase();
                    if (key && !index[key]) {
                        index[key] = spec;
                    }
                });
            });
            return index;
        },

        /**
         * Rewrite [[wikilinks]]: resolved targets become note links,
         * the rest stay as bold text. Returns {text, resolved, left}.
         */
        rewriteWikilinks: function(content, index) {
            var stats = {resolved: 0, unresolved: 0, embeds: 0};

            var text = content.replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
            function(match, target, label) {
                var key  = target.trim().toLowerCase(),
                    spec = index[key];

                // Embeds stay literal in v1 (attachments follow).
                if (match[0] === '!') {
                    stats.embeds++;
                    return match;
                }

                if (spec) {
                    stats.resolved++;
                    return '[' + (label || target).trim() +
                        '](#/notes/show/' + spec.id + ')';
                }

                stats.unresolved++;
                return '**' + (label || target).trim() + '**';
            });

            return {
                text       : text,
                resolved   : stats.resolved,
                unresolved : stats.unresolved,
                embeds     : stats.embeds,
            };
        },

    };

    return mapper;
});
