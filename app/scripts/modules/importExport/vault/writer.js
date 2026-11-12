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
    'backbone.radio'
], function(_, Q, Radio) {
    'use strict';

    /**
     * Writer that persists vault imports through the app stack
     * (same save:raw path as ZIP import). Ids arrive pre-minted.
     */
    function makeWriter(profile) {
        var notebookCache = null;

        function notebooks() {
            if (notebookCache) {
                return new Q(notebookCache);
            }
            return Q.when(Radio.request('notebooks', 'get:all', {profile: profile}))
            .then(function(collection) {
                notebookCache = collection;
                return collection;
            });
        }

        return {
            findNotebook: function(name, parentId) {
                return notebooks().then(function(collection) {
                    var found = collection.findWhere({name: name, parentId: parentId});
                    return found ? found.get('id') : null;
                });
            },

            saveNotebook: function(attrs) {
                return Q.when(Radio.request('notebooks', 'save:raw', attrs, {profile: profile}))
                .then(function() {
                    notebookCache = null;
                    return attrs.id;
                });
            },

            saveNote: function(attrs) {
                return Q.when(Radio.request('notes', 'save:raw', attrs, {profile: profile}));
            },
        };
    }

    return {makeWriter: makeWriter};
});
