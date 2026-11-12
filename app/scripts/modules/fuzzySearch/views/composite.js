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
    'modules/fuzzySearch/views/item',
    'text!modules/fuzzySearch/templates/composite.html',
    'text!modules/fuzzySearch/templates/empty.html'
], function($, _, Marionette, Radio, ItemView, Tmpl, EmptyTmpl) {
    'use strict';

    /**
     * Composite view which shows "fuzzy" search results
     */
    var CompositeView = Marionette.CompositeView.extend({
        template  : _.template(Tmpl),

        childView          : ItemView,
        childViewContainer : '.notes-list',
        childViewOptions   : {},
        // No title matches; Enter still searches the text
        emptyView          : Marionette.ItemView.extend({
            template: _.template(EmptyTmpl)
        })
    });

    return CompositeView;
});
