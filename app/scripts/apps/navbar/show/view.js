/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'jquery',
    'underscore',
    'marionette',
    'backbone.radio',
    'behaviors/sidemenu',
    'text!apps/navbar/show/template.html'
], function($, _, Marionette, Radio, Sidemenu, Tmpl) {
    'use strict';

    /**
     * Navbar view.
     *
     * Listens to:
     * ----------
     * Events:
     * 1. channel: `global`, event: `show:search`
     *    focuses on search form
     *
     * Triggers events:
     * 1. channel: `global`, event: `search:shown`
     *    when the user opens the search form.
     * 2. channel: `global`, event: `search:hidden`
     *    when the search form is hidden or the navbar view is destroyed.
     * 3. event: `search:submit` to itself
     *    when the search form is submitted.
     * 4. channel: `global`, event: `search:change`
     *    every time when the user types something on the search form.
     *
     * Requests:
     * 1. channel: `uri`, request: `link:profile`
     * 2. channel: `uri`, request: `profile`
     */
    var View = Marionette.ItemView.extend({
        template: _.template(Tmpl),

        keyboardEvents:  {},

        behaviors: {
            Sidemenu: {
                behaviorClass: Sidemenu
            }
        },

        ui: {
            navbar  : '#sidebar--nav',
            search  : '#header--search--input',
            title   : '#header--title',
            count   : '#header--count',
            density : '#header--density',
            icon    : '#header--icon',
            sync    : '#header--sync--icon'
        },

        events: {
            'click #header--add'     : 'navigateAdd',
            'click #header--density' : 'toggleDensity',
            'click #header--about'   : 'showAbout',
            'focus @ui.search'       : 'onSearchFocus',
            'blur @ui.search'        : 'hideSearch',
            'input @ui.search'       : 'onSearchInput',
            'keydown @ui.search'     : 'onSearchKeydown',
            'submit #header--search' : 'searchSubmit',
            'click #header--sync'    : 'triggerSync'
        },

        collectionEvents: {
            'change': 'render'
        },

        initialize: function() {
            this.listenTo(this, 'change:title', this.changeTitle);
            this.listenTo(Radio.channel('global'), 'show:search', this.showSearch);

            this.listenTo(Radio.channel('sync'), 'start', this.onSyncStart);
            this.listenTo(Radio.channel('sync'), 'stop', this.onSyncStop);

            // Re-render the view when notebooks collection has changed
            this.listenTo(this.options.notebooks, 'change add remove', this.render);

            // The list says how many notes it holds
            this.listenTo(Radio.channel('appNote'), 'list:count', this.setCount);

            // Picking a title match ends the search from outside
            this.listenTo(Radio.channel('global'), 'search:hidden', function() {
                this._searching = false;
            });
        },

        onRender: function() {
            $('#sidebar').toggleClass('-compact', this.isCompact());
        },

        onDestroy: function() {
            this.stopSearch();
        },

        /**
         * How many notes the list holds, next to its title.
         */
        setCount: function(count) {
            this.count = count;
            if (this.ui.count.length) {
                this.ui.count.text(_.isNumber(count) ? count : '');
            }
        },

        /**
         * List density is a preference of this device, not a
         * setting that travels with the notes.
         */
        isCompact: function() {
            try {
                return window.localStorage.getItem('seshat.density') === 'compact';
            } catch (e) {
                return false;
            }
        },

        toggleDensity: function() {
            var compact = !this.isCompact();

            try {
                window.localStorage.setItem('seshat.density', compact ? 'compact' : 'comfortable');
            } catch (e) {}

            $('#sidebar').toggleClass('-compact', compact);
            this.ui.density.toggleClass('active', compact).attr('aria-pressed', compact);
            return false;
        },

        triggerSync: function() {
            Radio.request('sync', 'start');
        },

        onSyncStart: function() {
            this.ui.sync.toggleClass('animate-spin', true);
        },

        onSyncStop: function() {
            this.ui.sync.toggleClass('animate-spin', false);
        },

        /**
         * Trigger form:show event when add button is clicked.
         */
        navigateAdd: function() {
            Radio.trigger('global', 'form:show');
            return false;
        },

        /**
         * Change navbar title
         */
        changeTitle: function(options) {
            var icon = this.templateHelpers().getIcon.apply(options);

            this.ui.title.text($.t(options.title));
            this.ui.icon.attr('class', icon);
            this.options.args = options.args;

            // Another list: the field follows it
            if (!this.ui.search.is(':focus')) {
                this.ui.search.val(this.templateHelpers().searchQuery.apply(options));
            }
        },

        searchSubmit: function() {
            var text = this.ui.search.val().trim();
            this.ui.search.blur();

            if (text.length) {
                this.trigger('search:submit', text);
            }
            else {
                this.clearSearch();
            }

            this.stopSearch();

            return false;
        },

        /**
         * An emptied field while search results are listed means
         * the search is over: back to all notes.
         */
        clearSearch: function() {
            if (this.options.args && this.options.args.filter === 'search') {
                Radio.request('uri', 'navigate', '/notes', {includeProfile: true});
            }
        },

        /**
         * The search key jumps to the field.
         */
        showSearch: function() {
            this.ui.search.focus().select();
            return false;
        },

        onSearchFocus: function() {
            this.ui.navbar.addClass('-search');
        },

        hideSearch: function() {
            this.ui.navbar.removeClass('-search');
        },

        /**
         * Title matches appear while typing. They start with the
         * first character and go away when the field is emptied.
         */
        startSearch: function() {
            if (!this._searching) {
                this._searching = true;
                Radio.trigger('global', 'search:shown');
            }
        },

        stopSearch: function() {
            if (this._searching) {
                this._searching = false;
                Radio.trigger('global', 'search:hidden');
            }
        },

        onSearchInput: function() {
            var text = this.ui.search.val().trim();

            if (!text.length) {
                return this.stopSearch();
            }

            this.startSearch();
            Radio.trigger('global', 'search:change', text);
        },

        onSearchKeydown: function(e) {
            // Escape clears the field and gives the list back
            if (e.which === 27) {
                this.ui.search.val('');
                this.stopSearch();
                this.ui.search.blur();
                this.clearSearch();
                return false;
            }
        },

        showAbout: function(e) {
            e.preventDefault();
            Radio.request('Help', 'show:about');
        },

        serializeData: function() {
            var maxNotebooks = parseInt(Radio.request('configs', 'get:config', 'navbarNotebooksMax'), 10);
            // Ask the list in case it was shown before this bar
            if (_.isUndefined(this.count)) {
                this.count = Radio.request('appNote', 'list:count');
            }

            return {
                args      : this.options.args,
                count     : _.isNumber(this.count) ? this.count : '',
                compact   : this.isCompact(),
                configs   : this.collection.getConfigs(),
                profiles  : this.options.profiles.getValueJSON(),
                notebooks : _.first(this.options.notebooks.toJSON(), maxNotebooks),
                uri       : Radio.request('uri', 'link:profile', '/'),
                profile   : Radio.request('uri', 'profile')
            };
        },

        templateHelpers: function() {
            return {
                getIcon: function() {
                    return 'icon-' + (
                        !this.args.filter ? 'note' : this.args.filter
                    );
                },

                // The words of the search being shown, if any
                searchQuery: function() {
                    return (this.args && this.args.filter === 'search' && this.args.query) || '';
                },

                isSyncEnabled: function() {
                    // The rsync backend, in the desktop app. (Dropbox
                    // is gone; RemoteStorage is unvalidated and shows
                    // its own widget.)
                    return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__ &&
                        this.configs.cloudStorage === 'rsync' &&
                        String(this.configs.syncRemote || '').trim().length > 0;
                },

                profileLink: function(profileName) {
                    return Radio.request('uri', 'link:profile', '/notes', profileName);
                }
            };
        }
    });

    return View;
});
