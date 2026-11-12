/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/*global define*/
define([
    'underscore',
    'marionette',
    'backbone.radio',
    'behaviors/sidebar',
    'apps/notes/list/views/noteSidebarItem',
    'helpers/when',
    'text!apps/notes/list/templates/sidebarList.html',
    'text!apps/notes/list/templates/sidebarEmpty.html',
    'mousetrap'
], function(_, Marionette, Radio, Behavior, NoteSidebarItem, When, Tmpl, EmptyTmpl, Mousetrap) {
    'use strict';

    /**
     * Shown instead of rows when a list has no notes.
     */
    var EmptyView = Marionette.ItemView.extend({
        template: _.template(EmptyTmpl),

        serializeData: function() {
            var filter = this.options.args.filter;
            return {
                canCreate : !filter || filter === 'active',
                key       : Radio.request('configs', 'get:config', 'appCreateNote')
            };
        }
    });

    /**
     * Sidebar composite view: every note of the current filter in
     * one continuous list, under headings (favourites, then dates
     * or letters depending on the sort order).
     *
     * Listens to
     * -----------
     * Events:
     * 1. channel: `notes`, event: `model:navigate`
     *    Makes the provided model active.
     *
     * Triggers
     * --------
     * 1. channel: `appNote`, event: `list:count`
     *    With the number of notes listed, whenever it changes.
     *
     * Replies
     * -------
     * 1. channel: `appNote`, request: `list:count`
     */
    var View = Marionette.CompositeView.extend({
        template           :  _.template(Tmpl),

        childView          :  NoteSidebarItem,
        childViewContainer :  '.list',
        childViewOptions   :  {},

        // Marionette's own sort support renumbers every row each time
        // one is added or removed (quadratic over a list). The list
        // is re-rendered on reset anyway; `resort` covers the rest.
        sort               :  false,

        emptyView          :  EmptyView,
        emptyViewOptions   :  function() {
            return {args: this.options.args};
        },

        behaviors: {
            SidebarBehavior: {
                behaviorClass: Behavior
            }
        },

        // One listener for every star, instead of one per row
        events: {
            'click .favorite': 'toggleFavorite'
        },

        collectionEvents: {
            'page:next'     : 'nextPage',
            'page:previous' : 'previousPage'
        },

        initialize: function() {
            _.bindAll(this, 'toNextNote', 'toPreviousNote', 'regroup', 'filterRows', 'resort');

            this.configs = Radio.request('configs', 'get:object');

            // Shortcuts
            Mousetrap.bind(this.configs.navigateBottom, this.toNextNote);
            Mousetrap.bind(this.configs.navigateTop, this.toPreviousNote);

            // Events
            this.listenTo(Radio.channel('notes'), 'model:navigate', this.modelFocus, this);

            // Headings follow the rows: redo them after anything
            // that adds, removes or reorders a row.
            this.regroupSoon = _.debounce(this.regroup, 0);
            this.listenTo(this, 'render:collection add:child remove:child', this.regroupSoon);

            // After the handlers of the event that caused the sort
            // (a reset renders the list itself)
            this.listenTo(this.collection, 'sort', function() {
                _.defer(this.resort);
            });

            Radio.channel('appNote').reply('list:count', this.getCount, this);

            // Typing in the search field narrows the list in place
            this.words = [];
            this.listenTo(Radio.channel('global'), 'search:change', _.debounce(this.filterRows, 60));
            this.listenTo(Radio.channel('global'), 'search:hidden', this.filterRows);

            // Pass options to childView
            this.childViewOptions.args = this.options.args;
        },

        onDestroy: function() {
            Mousetrap.unbind([this.configs.navigateBottom, this.configs.navigateTop]);

            // Nothing is listed any more
            Radio.channel('appNote').stopReplying('list:count');
            Radio.trigger('appNote', 'list:count', null);
        },

        onBeforeRender: function() {
            this.options.args = Radio.request('appNote', 'route:args') || this.options.args;
            this.childViewOptions.args = this.options.args;
        },

        onRender: function() {
            this.regroup();
        },

        toggleFavorite: function(e) {
            var model = this.collection.get($(e.currentTarget).closest('[data-id]').attr('data-id'));

            if (model) {
                Radio.request('notes', 'save', model, model.toggleFavorite());
            }
            return false;
        },

        /**
         * The collection was sorted (a star was toggled). Rows are
         * drawn again only if their order really changed.
         */
        resort: function() {
            if (this.isDestroyed || !this.$childViewContainer) {
                return;
            }

            if (_.isEqual(this.collection.pluck('id'), this.order)) {
                return this.regroup();
            }
            this.resortView();
        },

        getCount: function() {
            return this.words.length ? this.shown : this.collection.length;
        },

        /**
         * Narrows the list to the notes that contain every word
         * typed, in the title or the text. Nothing is fetched or
         * re-rendered: rows that do not match are only hidden, so
         * this stays instant with several hundred notes.
         */
        filterRows: function(text) {
            if (this.isDestroyed) {
                return;
            }

            this.words = _.compact(
                String(_.isString(text) ? text : '').toLocaleLowerCase().split(/\s+/)
            );
            this.regroup();
        },

        isMatch: function(model) {
            if (!this.words.length) {
                return true;
            }

            var text = _.unescape(
                (model.get('title') || '') + '\n' + (model.get('content') || '')
            ).toLocaleLowerCase();

            return _.every(this.words, function(word) {
                return text.indexOf(word) !== -1;
            });
        },

        /**
         * The heading a note is filed under.
         */
        getGroup: function(model, byDate) {
            // Favourites are sorted first, so they get a section of
            // their own, except in the list that is only favourites.
            if (model.get('isFavorite') === 1 && this.collection.conditionFilter !== 'favorite') {
                return {key: 'favorite', label: $.t('Favourites')};
            }

            var field = this.collection.sortField;

            if (field === 'title') {
                var letter = ((model.get('title') || '').trim().charAt(0) || '#').toLocaleUpperCase();

                // Digits and punctuation share one heading
                if (/[\x00-\x40\x5b-\x60\x7b-\x7f]/.test(letter)) {
                    letter = '#';
                }
                return {key: 'letter-' + letter, label: letter};
            }

            return byDate(model.get(field === 'updated' ? 'updated' : 'created'));
        },

        /**
         * Hides the rows the search does not match, then puts a
         * heading before the first row left in every group.
         */
        regroup: function() {
            if (this.isDestroyed || !this.$childViewContainer) {
                return;
            }

            var self   = this,
                byDate = When.grouper(),
                last   = null,
                shown  = 0;

            this.$childViewContainer.children('.list--heading, .list--hint').remove();

            this.collection.each(function(model) {
                var view = self.children.findByModel(model);
                if (!view) {
                    return;
                }

                var match = self.isMatch(model);
                view.$el.toggleClass('hidden', !match);
                if (!match) {
                    return;
                }
                shown++;

                var group = self.getGroup(model, byDate);
                if (group.key === last) {
                    return;
                }
                last = group.key;

                view.$el.before(
                    $('<div class="list--heading" role="heading" aria-level="2"/>')
                    .text(group.label)
                );
            });

            this.shown = shown;
            this.order = this.collection.pluck('id');

            // Enter looks through every note, not only this list
            if (this.words.length) {
                this.$childViewContainer.append(
                    $('<p class="list--hint"/>')
                    .append($('<kbd/>').html('&crarr;'))
                    .append(document.createTextNode(' ' + $.t('appSearch')))
                );
            }

            Radio.trigger('appNote', 'list:count', this.getCount());
        },

        /**
         * The next or previous note that is on show, for the
         * keyboard, when the search has hidden some rows.
         */
        stepShown: function(step) {
            var models = this.collection.filter(this.isMatch, this),
                index  = _.indexOf(models, this.collection.get(this.options.args.id)),
                model  = models[index === -1 ? (step > 0 ? 0 : models.length - 1) : index + step];

            if (model) {
                Radio.trigger('notes', 'model:navigate', model);
            }
            return false;
        },

        /**
         * Makes the provided model active.
         */
        modelFocus: _.debounce(function(model) {
            this.options.args.id = model.id;
            model.trigger('focus');
        }, 10),

        toNextNote: function() {
            if (this.words.length) {
                return this.stepShown(1);
            }
            this.collection.getNextItem(this.options.args.id);
            return false;
        },

        toPreviousNote: function() {
            if (this.words.length) {
                return this.stepShown(-1);
            }
            this.collection.getPreviousItem(this.options.args.id);
            return false;
        },

        /**
         * The list is one page now; these only matter if a
         * collection was fetched with a page size.
         */
        nextPage: function() {
            if (this.collection.hasNextPage()) {
                this.collection.getNextPage();
            }
        },

        previousPage: function() {
            if (this.collection.hasPreviousPage()) {
                this.collection.getPreviousPage();
            }
        },

        serializeData: function() {
            var viewData = {
                collection  : this.collection,
                args        : this.options.args
            };
            return viewData;
        }

    });

    return View;
});
