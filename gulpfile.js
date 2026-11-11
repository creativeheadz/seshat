'use strict';

/**
 * Seshat build (Gulp 5).
 *
 * Wired tasks: lint (jshint, jsonlint), the build chain (clean,
 * prism, less, copy, require, htmlmin, cssmin, htmlManifest)
 * and serve (dev server + watch).
 *
 * Not wired (see ROADMAP.md): release and electron (desktop
 * returns in phase 2 as Tauri), mobile (Cordova is a dead end;
 * PWA in phase 2), mocha and nightwatch (replaced by the
 * Vitest/Playwright harness). Their files stay on disk until
 * their owning phase removes them.
 */
var gulp     = require('gulp'),
    minimist = require('minimist'),
    plugins  = require('gulp-load-plugins')();

var delModule = require('del');
plugins.del         = delModule.deleteAsync || delModule.default || delModule;
plugins.browserSync = require('browser-sync').create();

var argv = minimist(process.argv.slice(2));

function getTask(task) {
    return require('./gulps/' + task)(gulp, plugins, argv);
}

var jshint       = getTask('jshint'),
    jsonlint     = getTask('jsonlint'),
    less         = getTask('less'),
    prism        = getTask('prism'),
    copyTasks    = getTask('copy'),
    requireTask  = getTask('require'),
    htmlmin      = getTask('htmlmin'),
    cssmin       = getTask('cssmin'),
    htmlManifest = getTask('htmlManifest'),
    clean        = getTask('clean'),
    serveStart   = getTask('serve');

function serveWatch(done) {
    // Compile LESS files
    gulp.watch('app/styles/**/*.less', less);

    gulp.watch([
        'app/**/*.html',
        'app/scripts/**/*.js',
        'app/locales/**/*.json'
    ]).on('change', plugins.browserSync.reload);
    done();
}

var copy = gulp.parallel(
    copyTasks.license,
    copyTasks.appFiles,
    copyTasks.excluded,
    copyTasks.bower,
    copyTasks.mathjax
);

/**
 * Lint gate. Unit tests arrive with the new harness.
 */
var test = gulp.series(jsonlint, jshint);

/**
 * Build the app.
 * ``gulp build --dev`` to build without minifying.
 */
var build = gulp.series(
    clean.dist,
    gulp.parallel(prism, less),
    gulp.parallel(copy, requireTask, htmlmin, cssmin),
    htmlManifest
);

/**
 * Gulp server.
 * ``gulp --root dist`` to serve dist folder.
 */
var serve = gulp.series(
    gulp.parallel(less, prism),
    gulp.parallel(serveStart, serveWatch)
);

exports.test    = test;
exports.build   = build;
exports.serve   = serve;
exports.default = serve;

// Individual tasks, for debugging.
exports.jshint       = jshint;
exports.jsonlint     = jsonlint;
exports.less         = less;
exports.prism        = prism;
exports.copy         = copy;
exports.require      = requireTask;
exports.htmlmin      = htmlmin;
exports.cssmin       = cssmin;
exports.htmlManifest = htmlManifest;
exports.clean        = clean.dist;
