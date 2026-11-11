'use strict';

/**
 * Populate app/vendor/ from npm packages plus vendored bytes.
 *
 * Runs on postinstall (`npm run vendor` to re-run). Replaces Bower:
 * every bower.json dep maps to an exact-pinned npm package below,
 * except:
 *
 * - backbone.wreqr: transitive leftover, never referenced; dropped.
 * - prettify: dangling path in main.js, required nowhere, never
 *   installed by bower either; left dangling (same as 2017).
 * - Blob, device.js, to-markdown, modernizr, jszip, localforage:
 *   no usable npm equivalent (unpublished version, builder-only
 *   package, dist-less sources, or byte-divergent build), so their
 *   exact working bytes live in app/vendor-src/ (checked in).
 *
 * Layout: whole npm packages copied to app/vendor/<bowername>,
 * preserving the bower-era tree so requirejs paths only change
 * their prefix. Additive: never wipes app/vendor (the prism task
 * generates bundle.js into it at build time); `rm -rf app/vendor`
 * for a clean slate.
 */
var fs   = require('fs'),
    path = require('path');

var ROOT = path.resolve(__dirname, '..'),
    NM   = path.join(ROOT, 'node_modules'),
    SRC  = path.join(ROOT, 'app', 'vendor-src'),
    DEST = path.join(ROOT, 'app', 'vendor');

// [npmName, vendorDir]
var packages = [
    ['backbone', 'backbone'],
    ['backbone.babysitter', 'backbone.babysitter'],
    ['backbone.marionette', 'backbone.marionette'],
    ['backbone.radio', 'backbone.radio'],
    ['bluebird', 'bluebird'],
    ['blueimp-canvas-to-blob', 'blueimp-canvas-to-blob'],
    ['bootstrap', 'bootstrap'],
    ['codemirror', 'codemirror'],
    ['dropzone', 'dropzone'],
    ['enquire.js', 'enquire'],
    ['fastclick', 'fastclick'],
    ['file-saver', 'FileSaver'],
    ['fuse.js', 'fuse'],
    ['hammerjs', 'hammerjs'],
    ['i18next', 'i18next'],
    ['i18next-xhr-backend', 'i18next-xhr-backend'],
    ['jquery', 'jquery'],
    ['jquery-hammerjs', 'jquery-hammerjs'],
    ['markdown-it', 'markdown-it'],
    ['markdown-it-hashtag', 'markdown-it-hashtag'],
    ['markdown-it-imsize', 'markdown-it-imsize'],
    // NOTE: markdown-it-math stays on vendored 4.0.0 bytes (6.x changed
    // the plugin API; the npm package drags an abandoned babel chain).
    // ['markdown-it-math', 'markdown-it-math'],
    ['markdown-it-sanitizer', 'markdown-it-sanitizer'],
    ['mathjax', 'MathJax'],
    ['mousetrap', 'mousetrap'],
    ['prismjs', 'prism'],
    ['q', 'q'],
    ['remotestoragejs', 'remotestorage.js'],
    ['requirejs', 'requirejs'],
    ['requirejs-text', 'requirejs-text'],
    ['sjcl', 'sjcl'],
    ['tv4', 'tv4'],
    ['underscore', 'underscore'],
    ['xregexp', 'xregexp'],
    ['xss', 'xss'],
];

// [vendorSrcRel, vendorRel]
var vendored = [
    ['Blob/Blob.js', 'Blob/Blob.js'],
    ['device.js/lib/device.js', 'device.js/lib/device.js'],
    ['device.js/lib/device.min.js', 'device.js/lib/device.min.js'],
    ['to-markdown/src/to-markdown.js', 'to-markdown/src/to-markdown.js'],
    ['modernizr/modernizr.js', 'modernizr/modernizr.js'],
    ['jszip/dist/jszip.js', 'jszip/dist/jszip.js'],
    ['jszip/dist/jszip.min.js', 'jszip/dist/jszip.min.js'],
    ['localforage/dist/localforage.js', 'localforage/dist/localforage.js'],
    ['localforage/dist/localforage.min.js', 'localforage/dist/localforage.min.js'],
    ['localforage/dist/localforage.nopromises.js', 'localforage/dist/localforage.nopromises.js'],
    ['localforage/dist/localforage.nopromises.min.js', 'localforage/dist/localforage.nopromises.min.js'],
    ['markdown-it-math/dist/markdown-it-math.js', 'markdown-it-math/dist/markdown-it-math.js'],
    ['markdown-it-math/dist/markdown-it-math.min.js', 'markdown-it-math/dist/markdown-it-math.min.js'],
];

function mkdirp(dir) {
    fs.mkdirSync(dir, {recursive: true});
}

packages.forEach(function(pair) {
    var from = path.join(NM, pair[0]),
        to   = path.join(DEST, pair[1]);
    if (!fs.existsSync(from)) {
        console.error('vendor: missing node_modules/' + pair[0] + ' (run npm install first)');
        process.exit(1);
    }
    mkdirp(to);
    fs.cpSync(from, to, {recursive: true});
    console.log('vendor: ' + pair[0] + ' -> app/vendor/' + pair[1]);
});

vendored.forEach(function(pair) {
    var from = path.join(SRC, pair[0]),
        to   = path.join(DEST, pair[1]);
    if (!fs.existsSync(from)) {
        console.error('vendor: missing app/vendor-src/' + pair[0]);
        process.exit(1);
    }
    mkdirp(path.dirname(to));
    fs.copyFileSync(from, to);
});

console.log('vendor: ' + vendored.length + ' vendored files copied');
console.log('vendor: done -> app/vendor/');
