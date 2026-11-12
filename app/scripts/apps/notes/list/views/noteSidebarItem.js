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
    'backbone.radio',
    'marionette',
    'helpers/when',
    'text!apps/notes/list/templates/sidebarListItem.html',
], function(_, Radio, Marionette, When, Tmpl) {
    'use strict';

    /**
     * Plain words from the start of a note: Markdown marks, links
     * and tags are dropped so the row reads as a sentence.
     */
    function excerpt(content) {
        return _.unescape(String(content || '').substring(0, 600))
        .replace(/```[^\n]*\n?/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+\.)\s+/gm, '')
        .replace(/\[[ xX_-]?\]\s/g, '')
        .replace(/[*_~`|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 160);
    }

    /**
     * Sidebar item view.
     */
    var View = Marionette.ItemView.extend({
        template: _.template(Tmpl),

        className: 'list-group list--group',

        ui: {
            favorite : '.favorite',
        },

        events: {
            'click @ui.favorite': 'toggleFavorite'
        },

        modelEvents: {
            'change'            : 'render',
            'change:trash'      : 'remove',
            'focus'             : 'onChangeFocus'
        },

        initialize: function() {
            this.options.args.page = this.model.collection.state.currentPage;
        },

        toggleFavorite: function() {
            Radio.request('notes', 'save', this.model, this.model.toggleFavorite());
            return false;
        },

        onChangeFocus: function() {
            var $listGroup = this.$('.list-group-item');

            $('.list-group-item.active').removeClass('active');
            $listGroup.addClass('active');

            // Only moves the list when the row is out of sight
            if ($listGroup[0] && $listGroup[0].scrollIntoView) {
                $listGroup[0].scrollIntoView({block: 'nearest'});
            }
        },

        serializeData: function() {
            // Decrypting
            return _.extend(this.model.toJSON(), {
                args      : this.options.args,
                sortField : this.model.collection.sortField
            });
        },

        templateHelpers: function() {
            return {
                // The first words of the note
                getContent: function() {
                    return excerpt(this.content);
                },

                // The date the list is sorted by
                when: function() {
                    return When.short(
                        this.sortField === 'updated' ? this.updated : this.created
                    );
                },

                // Generate link
                link: function() {
                    return Radio.request('uri', 'link', this.args, this);
                },

                isActive: function() {
                    return this.args.id === this.id ? 'active' : '';
                }
            };
        }

    });

    return View;
});
