/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/*global define*/
define([
    'jquery',
    'underscore',
    'backbone.radio',
    'marionette',
    'helpers/hashtags',
    'apps/notes/list/views/noteSidebar'
], function ($, _, Radio, Marionette, Hashtags, Sidebar) {
    'use strict';

    /**
     * Notes list controller - shows notes list in the sidebar
     *
     * Listens to
     * ----------
     * Events:
     * 1. channel: `appNote`, event: `model:active`
     *    triggers `focus` event on the passed model.
     * 2. channel: `notes`, event: `model:navigate`
     *    navigates to the model which was passed with the event.
     *
     * Triggers
     * --------
     * Events:
     * 1. channel: `global`, event: `navigate`
     *    to navigate to a note page
     */
    var Controller = Marionette.Object.extend({

        initialize: function(options) {
            this.radio = Radio.channel;
            this.options = options;
            _.bindAll(this, 'show', 'filter', 'navigate');

            // Get configs
            this.configs = Radio.request('configs', 'get:object');

            // Listen to events
            this.listenTo(this.radio('appNote'), 'model:active', this.onModelActive, this);
            this.listenTo(this.radio('notes'), 'model:navigate', _.debounce(this.navigate, 420));

            // Fetch notes and show them
            this.filter(options);
        },

        onDestroy: function() {
            this.view.trigger('destroy');
            this.view.collection.trigger('reset:all');
        },

        /**
         * Renders the sidebar view
         */
        show: function(notes) {
            // Destroy old view
            if (this.view) {
                this.view.trigger('destroy');
                this.view = null;
            }

            // Render the view
            this.view = new Sidebar({
                collection: notes,
                args      : this.options
            });
            Radio.request('global', 'region:show', 'sidebar', this.view);

            this.indexTags(notes);
        },

        /**
         * Once per profile: tags that notes carry in their text but
         * that are missing from the tag list are added to it. Notes
         * imported before the importer read hashtags are the case in
         * point. Only the tag list is written; no note is touched.
         */
        indexTags: function(notes) {
            var filter = this.options.filter;

            // Wait for a list of all notes that has something in it
            if (Number(this.configs.tagsIndexed) || (filter && filter !== 'active') || !notes.length) {
                return;
            }
            this.configs.tagsIndexed = '1';

            var profile = this.options.profile,
                tags    = _.uniq(_.flatten(notes.map(function(note) {
                    return Hashtags.extract(note.get('content'));
                })));

            _.defer(function() {
                Radio.request('tags', 'add', tags, {profile: profile})
                .then(function() {
                    return Radio.request('configs', 'save:object',
                        {name: 'tagsIndexed', value: '1'}, null, {profile: profile});
                })
                .fail(function(e) {
                    console.error('Tag index:', e);
                });
            });
        },

        /**
         * Fetches data from `Notes` collection.
         */
        filter: _.debounce(function(options) {
            options.profile = options.profile || Radio.request('uri', 'profile');
            var tOptions    = this.view ? this.view.options.args : {},
                isEqual     = _.isEqual(
                    _.pick((tOptions), 'filter', 'profile', 'query', 'page'),
                    _.pick(options   , 'filter', 'profile', 'query', 'page')
                );

            // Do not fetch anything because nothing has changed
            if (isEqual) {
                return;
            }

            // Show the navbar
            Radio.request('navbar', 'start', options);
            // The whole list is one page: the view lists every note
            // under date headings instead of paging through them.
            options.pageSize = Number.MAX_SAFE_INTEGER;
            this.options = options;

            // Fetch data
            Radio.request('notes', 'get:all', options)
            .then(this.show);
        }, 100),

        onModelActive: function(model) {
            // The view was not rendered or the model is already active
            if (!this.view || !model || model.id === this.view.options.args.id) {
                return;
            }

            // Trigger `focus` event to a model.
            this.view.options.args.id = model.id;
            model = this.view.collection.get(model.id);
            if (model) {
                model.trigger('focus');
            }
        },

        navigate: function(model) {
            var args = Radio.request('appNote', 'route:args');

            /**
             * Before navigating to a note, change URI.
             * It is done because if a user navigates back to the same page
             * a note might not appear at all.
             */
            Radio.request('uri', 'navigate', {options: args}, {trigger: false});

            // Navigate to a note page
            Radio.request(
                'uri', 'navigate',
                {options: args, model: model}, {trigger: true}
            );
        }

    });

    return Controller;
});
