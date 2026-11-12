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
    'jquery',
    'backbone',
    'backbone.radio',
    'modules/sync/engine'
], function(_, Q, $, Backbone, Radio, Engine) {
    'use strict';

    /**
     * One sync run for one profile:
     *
     *   1. pull    rsync brings the remote's record files into a
     *              mirror folder on this machine
     *   2. plan    engine.js compares mirror, local store and what
     *              was agreed last time
     *   3. apply   remote versions are saved locally, local versions
     *              are written into the mirror
     *   4. push    rsync sends the mirror back
     *
     * Records travel exactly as the local store holds them, so with
     * encryption on only ciphertext ever leaves the machine.
     *
     * What this device remembers about a record is written in two
     * steps on purpose. "I took the remote's version" is true once it
     * is saved here, whatever happens next. "My version is on the
     * remote" is only true once the push has succeeded; if it is
     * recorded earlier and the push fails, the next run would mistake
     * the remote's older file for someone else's edit.
     */

    // Notebooks before notes, so a note's notebook is there when it
    // arrives. Notes are the only store where both versions of a
    // conflict are kept; a second copy of a notebook is only clutter.
    var STORES = [
        {name: 'notebooks', keepBoth: false},
        {name: 'tags',      keepBoth: false},
        {name: 'notes',     keepBoth: true}
    ];

    function invoke(command, args) {
        return new Q(window.__TAURI_INTERNALS__.invoke(command, args));
    }

    function deviceId() {
        var id;
        try {
            id = window.localStorage.getItem('seshat.device');
            if (!id) {
                id = Math.random().toString(16).slice(2, 10);
                window.localStorage.setItem('seshat.device', id);
            }
        } catch (e) {
            id = 'device';
        }
        return id;
    }

    function chunks(list, size) {
        var out = [];
        for (var i = 0; i < list.length; i += size) {
            out.push(list.slice(i, i + size));
        }
        return out;
    }

    function Runner(options) {
        this.profile = options.profile;
        this.remote  = options.remote;
        this.port    = options.port ? Number(options.port) : null;
        this.device  = deviceId();
        this.summary = {pulled: 0, pushed: 0, conflicts: 0, skipped: 0};
    }

    _.extend(Runner.prototype, {

        transfer: function(direction) {
            return invoke('sync_transfer', {
                remote    : this.remote,
                port      : this.port,
                profile   : this.profile,
                direction : direction
            })
            .then(function(report) {
                if (!report || !report.ok) {
                    var error  = new Error((report && report.message) || 'sync failed');
                    error.step = report && report.step;
                    throw error;
                }
            });
        },

        /**
         * Every record of a store as the store holds it (encrypted
         * ones stay encrypted).
         */
        localRecords: function(store) {
            return new Q(Radio.request(store, 'fetch', {encrypt: true, profile: this.profile}))
            .then(function(collection) {
                var records = {};

                (collection.fullCollection || collection).each(function(model) {
                    records[model.id] = _.clone(model.attributes);
                });
                return records;
            });
        },

        /**
         * Every record file in the mirror, checked against its rev.
         */
        mirrorFiles: function(store) {
            var self = this;

            return invoke('sync_list', {profile: this.profile, store: store})
            .then(function(entries) {
                var names = _.pluck(entries, 'name'),
                    files = {},
                    chain = new Q();

                _.each(chunks(names, 200), function(part) {
                    chain = chain.then(function() {
                        return invoke('sync_read', {profile: self.profile, store: store, names: part});
                    })
                    .then(function(read) {
                        _.each(read, function(item) {
                            var file = Engine.unpack(item.content);

                            // A file under the wrong name is not that record
                            if (file && file.record.id + '.json' === item.name) {
                                files[file.record.id] = file;
                            }
                        });
                    });
                });

                return chain.thenResolve(files);
            });
        },

        readState: function(store) {
            return invoke('sync_read', {profile: this.profile, store: 'state', names: [store + '.json']})
            .then(function(read) {
                try {
                    var state = JSON.parse(read[0].content);
                    return _.isObject(state) ? state : {};
                } catch (e) {
                    return {};
                }
            });
        },

        writeState: function(store, state) {
            return invoke('sync_write', {
                profile : this.profile,
                store   : 'state',
                files   : [{name: store + '.json', content: JSON.stringify(state)}]
            });
        },

        /**
         * The note in the editor is left alone for this run: saving
         * the remote's version under it would be undone, unseen, by
         * the next keystroke.
         */
        beingEdited: function() {
            var model = Radio.request('notesForm', 'model');
            return model && model.id;
        },

        /**
         * A record that another device encrypted can only be taken
         * in by a device that can read it. One with encryption off
         * would store the sealed text as it is and show an empty
         * note; one with another key could not open it at all. Either
         * way the run stops here, before anything is saved or sent.
         */
        canRead: function(record) {
            var configs = Radio.request('configs', 'get:object') || {},
                error;

            if (Number(configs.encrypt) !== 1) {
                error      = new Error($.t('sync.encrypted there'));
                error.step = 'read';
                return Q.reject(error);
            }

            // Inside a promise: a failed decryption can throw outright
            return new Q()
            .then(function() {
                return Radio.request('encrypt', 'decrypt:model', new Backbone.Model(_.clone(record)));
            })
            .fail(function() {
                error      = new Error($.t('sync.other key'));
                error.step = 'read';
                throw error;
            });
        },

        /**
         * The local version of a note lives on as a note of its own.
         */
        keepCopy: function(id) {
            var self = this;

            return new Q(Radio.request('notes', 'get:model', {id: id, profile: this.profile}))
            .then(function(original) {
                if (!original) {
                    return;
                }

                return new Q(Radio.request('notes', 'get:model', {profile: self.profile}))
                .then(function(copy) {
                    var attrs = _.omit(original.toJSON(), 'id', 'encryptedData');

                    attrs.title = (_.unescape(attrs.title || '') + ' (' + $.t('conflict copy') + ')');
                    return Radio.request('notes', 'save', copy, attrs);
                });
            });
        },

        /**
         * Steps 2 and 3 for one store. Resolves with the files to
         * push and the state to record once they are up.
         */
        syncStore: function(store) {
            var self = this;

            return Q.all([
                this.localRecords(store.name),
                this.mirrorFiles(store.name),
                this.readState(store.name)
            ])
            .spread(function(records, files, state) {
                var local  = {},
                    remote = {},
                    editing = store.name === 'notes' ? self.beingEdited() : null;

                _.each(records, function(record, id) {
                    local[id] = {hash: Engine.hash(record), updated: record.updated};
                });
                _.each(files, function(file, id) {
                    remote[id] = {rev: file.rev, ancestors: file.ancestors, updated: file.record.updated};
                });

                var plan    = Engine.plan(local, remote, state, {keepBoth: store.keepBoth}),
                    toPush  = [],
                    pushed  = {},
                    arrived = [],
                    sealed  = _.find(plan, function(step) {
                        return (step.action === 'pull' || step.action === 'conflict') &&
                            step.id !== editing && files[step.id].record.encryptedData;
                    }),
                    chain   = sealed ? self.canRead(files[sealed.id].record) : new Q();

                _.each(plan, function(step) {
                    var id = step.id;

                    if (id === editing && step.action !== 'push') {
                        self.summary.skipped++;
                        return;
                    }

                    if (step.action === 'push') {
                        var known = state[id] && files[id] && files[id].rev === state[id].rev,
                            file  = Engine.pack(records[id], state[id] ? {
                                rev       : state[id].rev,
                                ancestors : known ? files[id].ancestors : []
                            } : null, self.device);

                        toPush.push({name: id + '.json', content: JSON.stringify(file)});
                        pushed[id] = {rev: file.rev, local: file.rev};
                        self.summary.pushed++;
                    }
                    else if (step.action === 'pull' || step.action === 'conflict') {
                        chain = chain.then(function() {
                            return step.action === 'conflict' ? self.keepCopy(id) : null;
                        })
                        .then(function() {
                            return Radio.request(store.name, 'save:raw', _.clone(files[id].record), {
                                profile: self.profile
                            });
                        })
                        .then(function() {
                            arrived.push(id);
                            self.summary[step.action === 'conflict' ? 'conflicts' : 'pulled']++;
                        });
                    }
                    else if (step.action === 'link') {
                        state[id] = {rev: remote[id].rev, local: local[id].hash};
                    }
                    else if (step.action === 'forget') {
                        delete state[id];
                    }
                });

                return chain
                .then(function() {
                    // What arrived is stored again by this app (and
                    // re-encrypted with a new IV), so its bytes here
                    // are not the remote's: remember them as they are
                    return arrived.length ? self.localRecords(store.name) : {};
                })
                .then(function(now) {
                    _.each(arrived, function(id) {
                        if (now[id]) {
                            state[id] = {rev: remote[id].rev, local: Engine.hash(now[id])};
                        }
                    });
                    return self.writeState(store.name, state);
                })
                .then(function() {
                    return {store: store.name, files: toPush, state: state, pushed: pushed};
                });
            });
        },

        /**
         * A tag's id is a plain SHA-256 of its name, and the id is
         * the file name: on the remote a common word could be guessed
         * from it however well the record is sealed. With encryption
         * on, tags stay on this machine.
         */
        stores: function() {
            var configs = Radio.request('configs', 'get:object') || {};

            return _.filter(STORES, function(store) {
                return store.name !== 'tags' || Number(configs.encrypt) !== 1;
            });
        },

        run: function() {
            var self    = this,
                results = [];

            return this.transfer('pull')
            .then(function() {
                return _.reduce(self.stores(), function(chain, store) {
                    return chain.then(function() {
                        return self.syncStore(store);
                    })
                    .then(function(result) {
                        results.push(result);
                    });
                }, new Q());
            })
            .then(function() {
                return _.reduce(results, function(chain, result) {
                    return chain.then(function() {
                        return _.reduce(chunks(result.files, 200), function(inner, part) {
                            return inner.then(function() {
                                return invoke('sync_write', {
                                    profile: self.profile, store: result.store, files: part
                                });
                            });
                        }, new Q());
                    });
                }, new Q());
            })
            .then(function() {
                return _.some(results, function(result) { return result.files.length; }) ?
                    self.transfer('push') : null;
            })
            .then(function() {
                // The push is up: now it is true that our versions
                // are the remote's
                return _.reduce(results, function(chain, result) {
                    if (_.isEmpty(result.pushed)) {
                        return chain;
                    }
                    return chain.then(function() {
                        return self.writeState(result.store, _.extend(result.state, result.pushed));
                    });
                }, new Q());
            })
            .thenResolve(this.summary);
        }
    });

    Runner.isAvailable = function() {
        return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
    };

    return Runner;
});
