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
    'sjcl'
], function(_, sjcl) {
    'use strict';

    /**
     * The sync engine: what to do with each record, and nothing else.
     * No network, no database, no clock: it is given three pictures
     * and returns a plan, which is what makes it testable to the
     * point of trusting it with someone's notes.
     *
     * The remote is a dumb folder (a storage box reached with rsync,
     * a directory another tool moves around): one file per record,
     * and no server that could arbitrate. Each file therefore carries
     * its own history:
     *
     *   rev        hash of the record as stored
     *   ancestors  the revs this one replaced, newest first
     *
     * and each device remembers, per record, the rev it last agreed
     * on with the remote (`state.rev`) and what its own copy looked
     * like at that moment (`state.local`). From those:
     *
     *   remote rev == state.rev          nothing new there
     *   state.rev among remote ancestors remote moved on from what we had
     *   neither                          remote came from somewhere else
     *   local hash == state.local        nothing new here
     *
     * The one rule above the table: a version that exists nowhere
     * else is never replaced. If both sides changed, or the remote
     * did not grow out of what this device had, the local version is
     * kept as a copy (notes) or the newer one wins (notebooks, tags,
     * where a copy would only be clutter).
     */
    var MAX_ANCESTORS = 50;

    // JSON with keys in order, so equal records hash equal
    function canonical(value) {
        if (_.isArray(value)) {
            return '[' + _.map(value, canonical).join(',') + ']';
        }
        if (_.isObject(value)) {
            return '{' + _.map(_.keys(value).sort(), function(key) {
                return JSON.stringify(key) + ':' + canonical(value[key]);
            }).join(',') + '}';
        }
        return JSON.stringify(_.isUndefined(value) ? null : value);
    }

    var Engine = {

        MAX_ANCESTORS: MAX_ANCESTORS,

        canonical: canonical,

        /**
         * The rev of a record: SHA-256 of its canonical JSON.
         */
        hash: function(record) {
            return sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(canonical(record)));
        },

        /**
         * What goes into a record's file on the remote.
         */
        pack: function(record, state, device) {
            var ancestors = [];

            if (state && state.rev) {
                ancestors = [state.rev].concat(state.ancestors || []).slice(0, MAX_ANCESTORS);
            }

            return {
                seshat    : 1,
                rev       : Engine.hash(record),
                ancestors : ancestors,
                device    : device || '',
                record    : record
            };
        },

        /**
         * Reads a record's file. Returns null for anything that is
         * not one, or whose content does not match its own rev (cut
         * short, edited, damaged): such a file is never adopted.
         */
        unpack: function(text) {
            var file;

            try {
                file = _.isString(text) ? JSON.parse(text) : text;
            } catch (e) {
                return null;
            }

            if (!file || file.seshat !== 1 || !_.isObject(file.record) ||
                !_.isString(file.rev) || !_.isArray(file.ancestors) ||
                !_.isString(file.record.id) ||
                Engine.hash(file.record) !== file.rev) {
                return null;
            }

            return file;
        },

        /**
         * Decide what to do with one record.
         *
         * @param {Object} local  {hash, updated} or null
         * @param {Object} remote {rev, ancestors, updated} or null
         * @param {Object} state  {rev, local, ancestors} or null
         * @param {Boolean} keepBoth  notes: true
         * @return {String} one of:
         *   'none'      in step
         *   'link'      same content on both sides, only remember it
         *   'push'      send the local version
         *   'pull'      take the remote version
         *   'conflict'  take the remote version, keep the local one
         *               as a copy
         *   'forget'    gone on both sides
         */
        decide: function(local, remote, state, keepBoth) {
            if (!local && !remote) {
                return state ? 'forget' : 'none';
            }

            // Only here
            if (!remote) {
                return 'push';
            }

            // Only there. (A record this device once had and no
            // longer has comes back: nothing is deleted outright, a
            // removed note is a record that says so.)
            if (!local) {
                return 'pull';
            }

            var localChanged  = !state || local.hash !== state.local,
                remoteChanged = !state || remote.rev !== state.rev;

            if (!remoteChanged) {
                return localChanged ? 'push' : 'none';
            }

            // Both hold the very same bytes
            if (local.hash === remote.rev) {
                return 'link';
            }

            if (!localChanged) {
                // The remote grew out of what we had: follow it
                if (_.contains(remote.ancestors, state.rev)) {
                    return 'pull';
                }
                // It did not (another device overwrote our upload
                // without having seen it): our version exists only
                // here, so it must not be lost
                return Engine._both(local, remote, keepBoth);
            }

            // First meeting of two copies with no shared past: the
            // same moment of editing is taken to be the same edit
            if (!state && local.updated && local.updated === remote.updated) {
                return 'pull';
            }

            return Engine._both(local, remote, keepBoth);
        },

        _both: function(local, remote, keepBoth) {
            if (keepBoth) {
                return 'conflict';
            }
            return (Number(remote.updated) || 0) >= (Number(local.updated) || 0) ? 'pull' : 'push';
        },

        /**
         * Plan a whole store.
         *
         * @param {Object} local   id -> {hash, updated}
         * @param {Object} remote  id -> {rev, ancestors, updated}
         * @param {Object} state   id -> {rev, local, ancestors}
         * @param {Object} options {keepBoth}
         * @return {Array} [{id, action}], records in step left out
         */
        plan: function(local, remote, state, options) {
            var ids = _.union(_.keys(local), _.keys(remote), _.keys(state)).sort();

            return _.compact(_.map(ids, function(id) {
                var action = Engine.decide(
                    local[id] || null, remote[id] || null, state[id] || null,
                    Boolean(options && options.keepBoth)
                );
                return action === 'none' ? null : {id: id, action: action};
            }));
        }
    };

    return Engine;
});
