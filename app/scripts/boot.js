/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Runs in <head>, before the stylesheets paint anything: applies
 * the theme chosen in settings so a night reader never gets a flash
 * of day. The setting itself lives with the other configs;
 * helpers/theme.js keeps this copy in step with it.
 */
(function() {
    'use strict';

    try {
        var theme = window.localStorage.getItem('seshat.theme');
        if (theme === 'day' || theme === 'night') {
            document.documentElement.setAttribute('data-theme', theme);
        }
    } catch (e) {}
})();
