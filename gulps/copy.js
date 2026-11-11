'use strict';

/**
 * Minify a stream unless --dev was passed.
 */
function maybeUglify(stream, plugins, argv) {
    if (!argv.dev) {
        stream = stream.pipe(plugins.uglify({
            preserveComments: 'license'
        }));
    }
    return stream;
}

/**
 * Copy additional dependencies into dist directory.
 *
 * Five independent sub-tasks, run in parallel by the gulpfile.
 * NOTE: these used to be merged into one stream with merge-stream,
 * which breaks under Gulp 5 (streamx pipelines crash with a premature
 * "Writable stream closed" as soon as another task runs concurrently).
 */
module.exports = function(gulp, plugins, argv) {
    var options = {base: './app/bower_components/'};

    function copyLicense() {
        return gulp.src([
            './LICENSE'
        ], {base: './'})
        .pipe(gulp.dest('./dist'));
    }

    function copyAppFiles() {
        return gulp.src([
            './app/scripts/modules/fs/**/*.*',
            './app/scripts/modules/electronSearch/**/*.*',
            './app/scripts/modules/fuzzySearch/**/*.*',
            './app/scripts/modules/mathjax/**/*.*',

            './app/scripts/modules/modules.json',

            './app/bower_components/prism/themes/prism.css',
            './app/images/**/*.+(png|jpg|gif|ico|icns)',
            './app/docs/**',
            './app/locales/**',
            './app/.htaccess',
            './app/*.+(xml|ico|txt|webapp)',
            './app/styles/**/*.+(eot|svg|ttf|woff)',
        ], {base: './app'})
        .pipe(gulp.dest('./dist'));
    }

    function copyExcluded() {
        // Copy and minify excluded modules
        return maybeUglify(gulp.src([
            './app/scripts/modules/markdown/libs/markdown-it-file.js',
            './app/scripts/modules/markdown/libs/markdown-it-task.js',
            './app/scripts/modules/markdown/libs/markdown-it.js',
            './app/scripts/modules/markdown/libs/markdown.js',
            './app/scripts/modules/markdown/workers/markdown.js',

            './app/scripts/workers/sjcl.js',
            './app/scripts/classes/sjcl.js',
            './app/scripts/classes/sjcl.worker.js',

            './app/scripts/helpers/Dropbox-sdk.min.js',
            './app/scripts/helpers/db.js',
            './app/scripts/helpers/migrate.js',
            './app/scripts/migrate.js',
            './app/scripts/workers/localForage.js',
        ], {base: './app'}), plugins, argv)
        .pipe(gulp.dest('./dist'));
    }

    function copyBower() {
        // Copy and minify Bower components
        return maybeUglify(gulp.src([
            './app/bower_components/markdown-it*/dist/*.min.js',

            './app/bower_components/backbone/backbone.js',
            './app/bower_components/jquery/dist/jquery.js',
            './app/bower_components/backbone.radio/build/backbone.radio.min.js',
            './app/bower_components/prism/bundle.js',
            './app/bower_components/requirejs/require.js',
            './app/bower_components/modernizr/modernizr.js',
            './app/bower_components/q/q.js',
            './app/bower_components/underscore/underscore.js',
            './app/bower_components/localforage/dist/localforage.js',
            // NOTE: no bower dropbox package exists; the SDK is vendored
            // as helpers/Dropbox-sdk.min.js (see main.js paths). Gulp 3
            // silently skipped this glob; Gulp 5 errors on it.
            './app/bower_components/sjcl/sjcl.js',

            // Remotestorage
            './app/bower_components/remotestorage.js/release/stable/remotestorage.js',
            './app/bower_components/tv4/tv4.js',
            './app/bower_components/bluebird/js/browser/bluebird.min.js',
        ], options), plugins, argv)
        .pipe(gulp.dest('./dist/bower_components/'));
    }

    function copyMathJax() {
        // Copy MathJax files
        return gulp.src([
            './app/bower_components/MathJax/*.js',
            './app/bower_components/MathJax/config/TeX-AMS-MML_HTMLorMML.js',
            './app/bower_components/MathJax/images/**',
            './app/bower_components/MathJax/extensions/**',
            './app/bower_components/MathJax/fonts/HTML-CSS/TeX/woff/**',
            './app/bower_components/MathJax/jax/element/**',
            './app/bower_components/MathJax/jax/input/+(MathML|TeX)/**',
            './app/bower_components/MathJax/jax/output/+(HTML-CSS|NativeMML)/**',
            './app/bower_components/MathJax/localization/en/**'
        ], options)
        .pipe(gulp.dest('./dist/bower_components/'));
    }

    return {
        license  : copyLicense,
        appFiles : copyAppFiles,
        excluded : copyExcluded,
        bower    : copyBower,
        mathjax  : copyMathJax
    };
};
