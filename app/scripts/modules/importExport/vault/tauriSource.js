/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define, window */
define([
    'q'
], function(Q) {
    'use strict';

    /**
     * Vault source backed by the Tauri shell: opens the native
     * folder picker and reads the whole vault in one IPC call.
     * Resolves null when the user cancels. Never loaded outside
     * Tauri (the UI gates on window.__TAURI__).
     */
    function pick() {
        return Q.when(window.__TAURI__.core.invoke('import_vault'))
        .then(function(scan) {
            if (!scan) {
                return null;
            }
            return {
                files   : scan.files || [],
                skipped : scan.skipped || [],
            };
        });
    }

    return {pick: pick};
});
