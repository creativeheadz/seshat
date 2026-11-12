/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
define([
    'q',
    'fileSaver'
], function(Q, fileSaver) {
    'use strict';

    /**
     * The bytes of a Blob (or of a string).
     */
    function toBytes(content) {
        if (typeof content === 'string') {
            content = new Blob([content]);
        }

        var defer  = Q.defer(),
            reader = new FileReader();

        reader.onload = function() {
            defer.resolve(new Uint8Array(reader.result));
        };
        reader.onerror = function() {
            defer.reject(reader.error);
        };
        reader.readAsArrayBuffer(content);

        return defer.promise;
    }

    /**
     * Save a file the app produced (a backup, exported settings).
     *
     * In a browser this is a download. The desktop shell's webview
     * has no download manager, so a blob link does nothing there:
     * the bytes go to the shell instead, which asks where to put
     * them. Resolves once the file is written, or with `null` if the
     * save dialog was cancelled.
     */
    return function(content, fileName) {

        if (window.__TAURI_INTERNALS__) {
            return toBytes(content)
            .then(function(bytes) {
                return window.__TAURI_INTERNALS__.invoke('save_file', bytes, {
                    headers: {'x-file-name': encodeURIComponent(fileName)}
                });
            });
        }

        // If it is not Cordova app, use HTML5's saveAs function
        if (!window.cordova) {
            return new Q(fileSaver(content, fileName));
        }

        var defer = Q.defer();

        window.resolveLocalFileSystemURL(window.cordova.file.externalDataDirectory, function(dir) {
            dir.getFile(fileName, {create: true}, function(file) {
                file.createWriter(function(writer) {
                    writer.write(content);
                    defer.resolve();
                });
            });
        });

        return defer.promise;
    };

});
