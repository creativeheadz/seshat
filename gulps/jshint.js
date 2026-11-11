'use strict';

module.exports = function(gulp, plugins) {
    return function() {
        return gulp.src([
            './app/scripts/**/*.js',
            './app/scripts/*.js',
            '!./app/scripts/**/*.min.js',
            // 7 pre-existing warnings in Dropbox sync (snake_case API
            // identifiers); owned by the sync-decision prompt, which
            // rewrites or deletes this code. Remove with it.
            '!./app/scripts/modules/dropbox/**'
        ])
        .pipe(plugins.jshint())
        .pipe(plugins.jshint.reporter('jshint-stylish'))
        .pipe(plugins.jshint.reporter('fail'));
    };
};
