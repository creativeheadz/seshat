/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
'use strict';

// Loads the app's AMD modules in Node via requirejs.
var path      = require('path'),
    requirejs = require('requirejs');

var SCRIPTS = path.join(__dirname, '..', '..', 'app', 'scripts'),
    VENDOR  = path.join(__dirname, '..', '..', 'app', 'vendor');

requirejs.config({
    baseUrl     : SCRIPTS,
    nodeRequire : require,
    paths: {
        q           : path.join(VENDOR, 'q', 'q'),
        underscore  : path.join(VENDOR, 'underscore', 'underscore'),
        sjcl        : path.join(VENDOR, 'sjcl', 'sjcl'),
        localforage : path.join(VENDOR, 'localforage', 'dist', 'localforage'),
    },
});

function load(mods) {
    return new Promise(function(resolve, reject) {
        requirejs(mods, function() {
            resolve(Array.prototype.slice.call(arguments));
        }, reject);
    });
}

module.exports = {load: load, requirejs: requirejs};
