/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'jquery'
], function($) {
    'use strict';

    /**
     * Links out of the desktop app.
     *
     * In a browser a link in a note opens a page. In the desktop
     * shell the window is the app itself: a plain link would replace
     * the notes with a web site and leave no way back, and a link
     * with target="_blank" would do nothing at all. Web and mail
     * links go to the shell instead, which hands them to the system
     * browser or mail client. Browsers are left alone.
     */
    var external = /^(https?:|mailto:)/i;

    function onClick(e) {
        var link = e.currentTarget,
            href = link.getAttribute('href') || '';

        if (!external.test(href) || e.isDefaultPrevented()) {
            return;
        }

        e.preventDefault();
        window.__TAURI_INTERNALS__.invoke('open_external', {url: link.href});
    }

    if (window.__TAURI_INTERNALS__) {
        $(document).on('click', 'a[href]', onClick);
    }

    return onClick;
});
