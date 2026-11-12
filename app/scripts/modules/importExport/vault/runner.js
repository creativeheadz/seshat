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
    'q',
    'modules/importExport/vault/mapper'
], function(_, Q, mapper) {
    'use strict';

    /**
     * Vault import orchestrator. Source and writer are injected:
     * - source() resolves {files: [{path, content, mtime?}], skipped: []}
     *   or null when the user cancels.
     * - writer: {findNotebook(name, parentId), saveNotebook(attrs),
     *   saveNote(attrs), saveTags(names)?, existing()?}; attrs carry
     *   pre-minted ids. existing() resolves a map of note fingerprint
     *   (mapper.fingerprint) to the id of the note already stored.
     * - opts: {onProgress({done, total}), batchSize}.
     */
    function ensureNotebooks(specs, writer) {
        var paths = _.chain(specs)
            .map(function(spec) { return spec.notebookPath; })
            .filter(function(path) { return path.length > 0; })
            .uniq(function(path) { return path.join('/'); })
            .sortBy(function(path) { return path.length; })
            .value(),
            ids   = {},
            chain = new Q();

        _.each(paths, function(path) {
            chain = chain.then(function() {
                var parentPath = path.slice(0, -1).join('/'),
                    parentId   = parentPath === '' ? '0' : ids[parentPath],
                    name       = path[path.length - 1];

                return Q.when(writer.findNotebook(name, parentId))
                .then(function(existing) {
                    if (existing) {
                        ids[path.join('/')] = existing;
                        return null;
                    }

                    var attrs = {
                        id       : mapper.mintId(),
                        type     : 'notebooks',
                        name     : name,
                        parentId : parentId,
                        count    : 0,
                        trash    : 0,
                        created  : Date.now(),
                        updated  : Date.now(),
                    };
                    return Q.when(writer.saveNotebook(attrs))
                    .then(function() {
                        ids[path.join('/')] = attrs.id;
                    });
                });
            });
        });

        return chain.then(function() { return ids; });
    }

    function importScan(scan, writer, opts) {
        var specs = _.map(scan.files, function(file) {
                var spec = mapper.mapNote(file);
                spec.id = mapper.mintId();
                return spec;
            }),
            summary = {
                notes      : 0,
                notebooks : 0,
                skipped    : scan.skipped.length,
                embeds     : 0,
                unresolved : 0,
                resolved   : 0,
                duplicates : 0,
            };

        var index = mapper.buildTitleIndex(specs);

        // The import is a one-time copy. Doing it again must not
        // double every note: a file whose title and text are already
        // here is left alone, and links to it point at the note that
        // is here.
        return Q.when(writer.existing ? writer.existing() : {})
        .then(function(existing) {
            _.each(specs, function(spec) {
                var text = mapper.rewriteWikilinks(spec.content, index).text,
                    id   = existing[mapper.fingerprint(spec.title, text)];

                if (id) {
                    spec.id        = id;
                    spec.duplicate = true;
                }
            });

            return ensureNotebooks(_.reject(specs, function(spec) {
                return spec.duplicate;
            }), writer);
        })
        .then(function(notebookIds) {
            var chain = new Q(),
                done  = 0;

            _.each(specs, function(spec, i) {
                chain = chain.then(function() {
                    if (spec.duplicate) {
                        done++;
                        summary.duplicates++;
                        if (done % opts.batchSize === 0 || done === specs.length) {
                            opts.onProgress({done: done, total: specs.length});
                        }
                        return;
                    }

                    var link = mapper.rewriteWikilinks(spec.content, index),
                        notebookId = notebookIds[spec.notebookPath.join('/')] || '0';

                    summary.embeds += link.embeds;
                    summary.unresolved += link.unresolved;
                    summary.resolved += link.resolved;

                    return writer.saveNote({
                        id            : spec.id,
                        type          : 'notes',
                        title         : spec.title,
                        content       : link.text,
                        notebookId    : notebookId,
                        tags          : spec.tags,
                        taskAll       : 0,
                        taskCompleted : 0,
                        created       : spec.created,
                        updated       : spec.created,
                        isFavorite    : 0,
                        trash         : 0,
                        files         : [],
                    })
                    .then(function() {
                        done++;
                        summary.notes++;
                        if (done % opts.batchSize === 0 || done === specs.length) {
                            opts.onProgress({done: done, total: specs.length});
                        }
                    });
                });

                // Yield to the UI between batches.
                if ((i + 1) % opts.batchSize === 0) {
                    chain = chain.delay(0);
                }
            });

            // The tag list (Notebooks & tags) is a store of its own
            chain = chain.then(function() {
                var tags = _.uniq(_.flatten(_.pluck(_.reject(specs, function(spec) {
                    return spec.duplicate;
                }), 'tags')));
                return writer.saveTags && tags.length ? writer.saveTags(tags) : null;
            });

            return chain.then(function() {
                summary.notebooks = _.size(notebookIds);
                return summary;
            });
        });
    }

    // Creates one notebook per distinct folder path, parents first.
    // Returns a promise of {joinedPath: id}.
    function run(source, writer, opts) {
        opts = _.extend({batchSize: 50, onProgress: function() {}}, opts);

        return Q.when(source())
        .then(function(scan) {
            if (!scan) {
                return {cancelled: true};
            }
            return importScan(scan, writer, opts);
        });
    }

    return {run: run};
});
