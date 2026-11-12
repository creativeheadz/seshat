'use strict';

/**
 * Minify JS files.
 * Require.js config example:
 * https://github.com/jrburke/r.js/blob/master/build/example.build.js
 */
var fs   = require('fs'),
    path = require('path');

var settingsViews = fs.readdirSync(
    path.join(__dirname, '..', 'app', 'scripts', 'apps', 'settings', 'show', 'views')
)
.filter(function(name) { return /\.js$/.test(name); })
.sort()
.map(function(name) {
    return 'apps/settings/show/views/' + name.replace(/\.js$/, '');
});

module.exports = function(gulp, plugins, argv) {
    return function requireJs() {
        var stream = gulp.src('./app/scripts/main.js')
        // Require.js optimizer
        .pipe(plugins.requirejsOptimize({
            name           : 'main',
            baseUrl        : './app/scripts',
            mainConfigFile : './app/scripts/main.js',
            optimize       : 'none',
            paths: {
                'workers': 'empty:'
            },
            exclude        : [
                'markdown-it',
                'markdown-it-hash',
                'markdown-it-math',
                'modules/markdown/libs/markdown-it-file',
                'modules/markdown/libs/markdown-it-task',
                'modules/markdown/libs/markdown-it',
                'modules/markdown/libs/markdown',

                'migrate',
                'helpers/db',
                'helpers/migrate',

                'backbone',
                'backbone.radio',
                'jquery',
                'prism',
                'q',
                'underscore',
                'localforage',
                'classes/sjcl',
                'sjcl',
                'remotestorage',
                'tv4',
                'bluebird',
                'mathjax',
            ],
            // Settings tabs are loaded by name at run time
            // ('apps/settings/show/views/' + tab), so the optimizer
            // cannot see them: every file in that folder is included.
            // The list used to be written out by hand and missed
            // `editor`, which left that tab blank in every build.
            include        : settingsViews.concat([
                'apps/settings/module/app',
                'apps/settings/module/controller',
                'views/loader',

                'backbone.sync',
                'backbone.noworker.sync',
                'modules/remotestorage/module'
            ]),
            findNestedDependencies : true,
            generateSourceMaps     : true,
            useStrict              : true,
            wrapShim               : true,
            preserveLicenseComments: true,
            wrap                   : true
        }));

        if (!argv.dev) {
            stream = stream.pipe(plugins.uglify({
                preserveComments: 'license'
            }));
        }

        return stream.pipe(gulp.dest('./dist/scripts'));
    };
};
