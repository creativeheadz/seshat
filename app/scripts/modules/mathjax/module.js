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
     * Maths.
     *
     * TeX between dollar signs ($x^2$, $$...$$) is typeset with
     * MathJax when a note that is being read or previewed contains
     * any. MathJax is large, so nothing of it is loaded until then:
     * a profile with no maths never downloads it.
     *
     * This used to be an optional module, off by default, so maths
     * showed as its source unless a setting was found and switched
     * on. The Markdown parser decides what is maths (it leaves prices
     * and shell variables alone); this only draws it.
     */
    var Maths = {

        // The note or preview on screen
        view    : null,

        loading : null,

        /**
         * Fetches MathJax and its helper, once.
         */
        load: function() {
            if (Maths.loading) {
                return Maths.loading;
            }

            var defer = Q.defer();

            requirejs(['mathjax', 'modules/mathjax/libs/mathjax'], function(MathJax, helper) {
                MathJax.Hub.Config({
                    jax     : ['input/TeX', 'output/HTML-CSS'],
                    tex2jax : {
                        inlineMath     : [['$', '$']],
                        displayMath    : [['$$', '$$']],
                        processClass   : 'math',
                        ignoreClass    : 'layout',
                        processEscapes : true
                    }
                });

                defer.resolve(helper);
            }, function(e) {
                // Let a later note try again
                Maths.loading = null;
                defer.reject(e);
            });

            Maths.loading = defer.promise;
            return Maths.loading;
        },

        render: function(view) {
            if (view && view.$el) {
                Maths.view = view;
            }

            if (!Maths.view || !Maths.view.$el.find('.math').length) {
                return;
            }

            return Maths.load()
            .then(function(helper) {
                if (Maths.view) {
                    return helper.render(Maths.view);
                }
            })
            .fail(function(e) {
                console.error('Maths:', e);
            });
        },

        forget: function() {
            Maths.view = null;
        }
    };

    Radio.request('init', 'add', 'module', function() {

        // A note is shown
        Radio.on('noteView', {
            'view:render'  : Maths.render,
            'view:destroy' : Maths.forget
        });

        // The editor's preview is shown, then redrawn as you type
        Radio.on('editor', {
            'view:render'     : Maths.render,
            'view:destroy'    : Maths.forget,
            'preview:refresh' : _.debounce(function() {
                Maths.render();
            }, 350)
        });
    });

    return Maths;
});
