/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'backbone.radio'
], function(Radio) {
    'use strict';

    /**
     * Day and night.
     *
     * `auto` (the default) follows the system. `day` and `night`
     * pin a theme with a `data-theme` attribute on <html>, which
     * the tokens in styles/theme-default/tokens.less key off. The
     * choice is mirrored to localStorage for scripts/boot.js.
     */
    var Theme = {

        key: 'seshat.theme',

        apply: function(theme) {
            var root   = document.documentElement,
                pinned = theme === 'day' || theme === 'night';

            if (pinned) {
                root.setAttribute('data-theme', theme);
            }
            else {
                root.removeAttribute('data-theme');
            }

            try {
                if (pinned) {
                    window.localStorage.setItem(Theme.key, theme);
                }
                else {
                    window.localStorage.removeItem(Theme.key);
                }
            } catch (e) {}
        },

        init: function() {
            Theme.apply(Radio.request('configs', 'get:config', 'theme'));
        }
    };

    Radio.request('init', 'add', 'app:before', Theme.init);

    return Theme;
});
