/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'underscore',
    'q',
    'localforage'
], function(_, Q, localForage) {
    'use strict';

    /**
     * LocalForage adapter.
     */
    var db = {
        dbs: {},

        /**
         * Create a new localforage instance if it doesn't exist for
         * current profile or store.
         *
         * @type object options
         */
        getDb: function(options) {
            var dbId = options.profile + '/' + options.storeName;

            this.dbs[dbId] = this.dbs[dbId] || localForage.createInstance({
                name      : options.profile || 'notes-db',
                storeName : options.storeName
            });

            return this.dbs[dbId];
        },

        /**
         * Find an item by ID.
         *
         * @type object data
         */
        find: function(data) {
            var defer = Q.defer();

            this.getDb(data.options).getItem(data.id, function(err, data) {
                if (err) {
                    return defer.reject(err);
                }

                if (!data) {
                    defer.reject('not found');
                }

                return defer.resolve(data);
            });

            return defer.promise;
        },

        /**
         * Find all items.
         *
         * @type object data
         */
        findAll: function(data) {
            var defer      = Q.defer(),
                conditions = data.options.conditions,
                models     = [];

            // One cursor over the store. This used to list the keys
            // and then open a transaction per record.
            this.getDb(data.options).iterate(function(item) {
                if (item && (!conditions || _.isMatch(item, conditions))) {
                    models.push(item);
                }
                // returning anything would stop the cursor
            }, function(err) {
                if (err) {
                    return defer.reject(err);
                }
                defer.resolve(models);
            });

            return defer.promise;
        },

        /**
         * Find all models with specified keys.
         *
         * @type array keys
         * @type object data
         */
        findByKeys: function(keys, data) {
            var promises = [],
                self     = this,
                models   = [];

            _.each(keys, function(key) {
                promises.push(
                    self.find({id: key, options: data.options})
                    .then(function(item) {

                        // If conditions are provided, filter items with them
                        if (item &&
                            (!data.options.conditions || _.isMatch(item, data.options.conditions))) {
                            models.push(item);
                            return item;
                        }

                        return;
                    })
                );
            });

            return Q.all(promises)
            .then(function() {
                return models;
            });
        },

        /**
         * Save an item.
         *
         * @type object data
         */
        save: function(data) {
            var defer = Q.defer(),
                sData = data.data;

            if (sData.encryptedData) {
                sData = _.omit(sData, data.options.encryptKeys);
            }

            this.getDb(data.options).setItem(data.id, sData, function(err, val) {
                if (err) {
                    return defer.reject(err);
                }

                return defer.resolve(val);
            });

            return defer.promise;
        },

    };

    return db;
});
