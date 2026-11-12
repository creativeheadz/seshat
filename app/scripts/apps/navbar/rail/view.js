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
    'jquery',
    'marionette',
    'backbone',
    'backbone.radio',
    'text!apps/navbar/rail/template.html'
], function(_, $, Marionette, Backbone, Radio, Tmpl) {
    'use strict';

    /**
     * Persistent icon rail: the six main destinations, always
     * visible. The hamburger drawer keeps the long tail
     * (notebook list, profiles, about).
     */
    var View = Marionette.ItemView.extend({
        template  : _.template(Tmpl),
        className : 'rail--nav',

        events: {
            'click .rail--mark': 'showAbout'
        },

        showAbout: function(e) {
            e.preventDefault();
            Radio.request('Help', 'show:about');
        },

        serializeData: function() {
            return {
                uri : Radio.request('uri', 'link:profile', '/')
            };
        },

        onShow: function() {
            this.updateActive();
            this.listenTo(Backbone.history, 'route', this.updateActive);
        },

        updateActive: function() {
            // Boot lands on an empty fragment showing notes.
            // Rail hrefs carry a leading slash (#/notes).
            var fragment = '#/' + (Backbone.history.getFragment() || 'notes');
            this.$('.rail--item').each(function() {
                var $a = $(this);
                $a.toggleClass('active', $a.attr('href') === fragment);
            });
        }
    });

    return View;
});
