/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define, requirejs */
define([
    'underscore',
    'q',
    'backbone.radio'
], function(_, Q, Radio) {
    'use strict';

    /**
     * Loads the parts of the app that depend on a setting.
     *
     * There used to be a list of optional "modules" a profile could
     * switch on (maths, a fuzzy title search, two that only ran under
     * Electron). It was a list of feature flags, not a way to extend
     * the app, and it is gone: maths loads itself when a note needs
     * it, search is built in. What is left is the sync backend, which
     * is only loaded when one is chosen.
     */
    var ModuleLoader = {

        init: function() {
            return this.load();
        },

        load: function() {
            var defer = Q.defer();

            requirejs(this.get(), function() {
                defer.resolve();
            });

            return defer.promise;
        },

        get: function() {
            var modules2Load = [];

            switch (Radio.request('configs', 'get:config', 'cloudStorage')) {
                case 'remotestorage':
                    modules2Load.push('modules/remotestorage/module');
                    break;

                // Dropbox removed in 0.8.0 (dead); stored
                // cloudStorage=dropbox configs load no module.
                default:
                    break;
            }

            return modules2Load;
        },
    };

    // Register an initializer
    Radio.request('init', 'add', 'load:modules', function() {
        return ModuleLoader.init();
    });

    return ModuleLoader;
});
