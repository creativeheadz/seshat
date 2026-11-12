/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define, requirejs */
define([
    'jquery',
    'q',
    'fastclick',
    'hammerjs',
    'helpers/radio.shim',
    'backbone.radio',
    'app',
    'initializers',
    'bootstrap',
    'jHammer'
], function($, Q, FastClick, Hammer, shim, Radio, App) {
    'use strict';

    var hash = document.location.hash;
    Radio.reply('global', 'hash:original', function() {
        return hash;
    });

    console.time('App');

    // Remove 300ms delay
    FastClick.attach(document.body);

    // Enable text selection
    delete Hammer.defaults.cssProps.userSelect;

    // Load all modules then start an application
    requirejs([
        // Helpers
        'helpers/storage',
        'helpers/uri',
        'helpers/title',
        'helpers/i18next',
        'helpers/theme',
        'helpers/externalLinks',
        'helpers/keybindings',

        // Classes
        'moduleLoader',
        'classes/encryption',

        // Collection modules
        'collections/modules/notes',
        'collections/modules/notebooks',
        'collections/modules/tags',
        'collections/modules/files',
        'collections/modules/configs',

        // Apps
        'apps/confirm/appConfirm',
        'apps/encryption/appEncrypt',
        'apps/navbar/appNavbar',
        'apps/notes/appNote',
        'apps/notebooks/appNotebooks',
        'apps/settings/appSettings',
        'apps/help/appHelp',

        // Modules
        'modules/markdown/module',
        'modules/codemirror/module',
        'modules/linkDialog/module',
        'modules/fileDialog/module',
        'modules/importExport/module'
    ], function(storage) {
        // Get profile name from location hash
        var profile = document.location.hash.match(/\/?p\/([^/]*)\//);
        profile     = (!profile ? profile : profile[profile.index]);

        return storage.check()
        .then(function() {
            if (!profile || profile === 'notes-db') {
                return;
            }

            /*
             * An address can name a profile that does not exist: a
             * typo, an old bookmark, a link from another install.
             * Opening it would create a new, empty database and show
             * an empty list with nothing to say why, which looks
             * exactly like "all my notes are gone" (gh-683, gh-670,
             * gh-440). Profiles are made in settings and listed in
             * the default profile; anything else falls back to it.
             */
            return Radio.request('configs', 'get:model', {name: 'appProfiles', profile: 'notes-db'})
            .then(function(model) {
                if (model.getValueJSON().indexOf(profile) !== -1) {
                    return;
                }

                console.warn('Unknown profile "' + profile + '": showing the default profile.');
                window.history.replaceState(
                    null, '', document.location.hash.replace(/\/?p\/[^/]*\//, '/')
                );
                profile = null;
            });
        })
        .then(function() {
            return Radio.request('configs', 'get:all', {profile: profile});
        })
        // Load optional modules
        .then(function() {
            return Radio.request('init', 'start', 'load:modules')();
        })
        .then(Radio.request('init', 'start', 'app:before app auth module'))
        .then(function() {
            console.log('modules are loaded');
            App.start();
        })
        .fail(function(e) {
            console.error('Error', e);
        });

    });

});
