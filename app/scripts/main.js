/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global requirejs, requireNode */
requirejs.config({

    // Find all nested dependencies
    findNestedDependencies: true,
    waitSeconds: 10,

    nodeRequire: (typeof requireNode === 'undefined' ? null : requireNode),

    packages: [
        // Codemirror editor
        {
            name     : 'codemirror',
            location : '../vendor/codemirror',
            main     : 'lib/codemirror'
        },
        // Prismjs
        {
            name     : 'prism',
            location : '../vendor/prism',
            main     : 'bundle'
        },
        // Xregexp
        {
            name     : 'xregexp',
            location : '../vendor/xregexp/src',
            main     : 'xregexp'
        }
    ],
    paths: {
        sjcl                  : '../vendor/sjcl/sjcl',
        text                  : '../vendor/requirejs-text/text',
        jquery                : '../vendor/jquery/dist/jquery',
        q                     : '../vendor/q/q',
        bootstrap             : '../vendor/bootstrap/dist/js/bootstrap.min',
        i18next               : '../vendor/i18next/i18next',
        i18nextXHRBackend     : '../vendor/i18next-xhr-backend/i18nextXHRBackend',

        // Backbone
        underscore            : '../vendor/underscore/underscore',
        backbone              : '../vendor/backbone/backbone',
        marionette            : '../vendor/backbone.marionette/lib/core/backbone.marionette',
        'backbone.radio'      : '../vendor/backbone.radio/build/backbone.radio.min',
        'backbone.babysitter' : '../vendor/backbone.babysitter/lib/backbone.babysitter',
        fuse                  : '../vendor/fuse/src/fuse',

        // Mousetrap
        'mousetrap'           : '../vendor/mousetrap/mousetrap',
        'mousetrap.pause'     : '../vendor/mousetrap/plugins/pause/mousetrap-pause',
        'mousetrap.global'    : '../vendor/mousetrap/plugins/global-bind/mousetrap-global-bind',

        // Storage adapters
        localforage           : '../vendor/localforage/dist/localforage',
        remotestorage         : '../vendor/remotestorage.js/release/stable/remotestorage',
        bluebird              : '../vendor/bluebird/js/browser/bluebird.min',
        tv4                   : '../vendor/tv4/tv4',
        dropbox               : 'helpers/Dropbox-sdk.min',

        // Markdown
        'markdown-it'         : '../vendor/markdown-it/dist/markdown-it.min',
        'markdown-it-san'     : '../vendor/markdown-it-sanitizer/dist/markdown-it-sanitizer.min',
        'markdown-it-hash'    : '../vendor/markdown-it-hashtag/dist/markdown-it-hashtag.min',
        'markdown-it-math'    : '../vendor/markdown-it-math/dist/markdown-it-math.min',
        'markdown-it-imsize'  : '../vendor/markdown-it-imsize/dist/markdown-it-imsize.min',
        'to-markdown'         : '../vendor/to-markdown/src/to-markdown',

        // Others
        xss                   : '../vendor/xss/dist/xss',
        mathjax               : '../vendor/MathJax/MathJax.js?config=TeX-AMS-MML_HTMLorMML',
        prettify              : '../vendor/google-code-prettify/src/prettify',
        dropzone              : '../vendor/dropzone/dist/dropzone-amd-module',
        toBlob                : '../vendor/blueimp-canvas-to-blob/js/canvas-to-blob',
        blobjs                : '../vendor/Blob/Blob',
        fileSaver             : '../vendor/FileSaver/FileSaver',
        enquire               : '../vendor/enquire/dist/enquire.min',
        hammerjs              : '../vendor/hammerjs/hammer',
        jHammer               : '../vendor/jquery-hammerjs/jquery.hammer',
        fastclick             : '../vendor/fastclick/lib/fastclick',
        devicejs              : '../vendor/device.js/lib/device.min',
        jszip                 : '../vendor/jszip/dist/jszip',

        // Aliases
        'modalRegion'         : 'views/modal',
        'brandRegion'         : 'views/brand',
        'apps'                : 'apps',
        'locales'             : '../locales'
    },
    map: {
        '*': {
            'backbone.wreqr' : 'backbone.radio'
        }
    },
    shim: {
        // Backbone
        underscore: {
            exports: '_'
        },
        fileSaver: {
            exports: 'saveAs',
        },
        backbone: {
            deps: ['underscore', 'jquery'],
            exports: 'Backbone'
        },

        // Storage adapters
        dropbox: {
            exports: 'Dropbox'
        },
        'remotestorage': {
            exports: 'RemoteStorage',
            deps: [
                'tv4',
                'bluebird',
            ]
        },
        tv4: {
            exports: 'tv4'
        },

        // Markdown
        'to-markdown': {
            exports: 'toMarkdown'
        },

        // Xregexp
        'xregexp/xregexp': {
            exports: 'XRegExp'
        },
        'xregexp/addons/unicode/unicode-base': {
            deps: ['xregexp/xregexp'],
            exports: 'XRegExp'
        },
        'xregexp/addons/unicode/unicode-categories': {
            deps: [
                'xregexp/addons/unicode/unicode-base'
            ],
            exports: 'XRegExp'
        },

        // Others
        sjcl: {
            exports: 'sjcl'
        },
        'prism/bundle': {
            exports: 'Prism'
        },
        xss: {
            exports: 'filterXSS'
        },
        bootstrap: {
            deps: ['jquery']
        },
        'mathjax': {
            exports: 'MathJax'
        },
        devicejs: {
            exports: 'device'
        },
        prettify: {
            exports: 'PR'
        }
    }
});

// Starting point
requirejs(['init']);
