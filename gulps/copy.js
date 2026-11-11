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
    var options = {base: './app/vendor/'};

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

            './app/vendor/prism/themes/prism.css',
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
            './app/vendor/markdown-it*/dist/*.min.js',

            './app/vendor/backbone/backbone.js',
            './app/vendor/jquery/dist/jquery.js',
            './app/vendor/backbone.radio/build/backbone.radio.min.js',
            './app/vendor/prism/bundle.js',
            './app/vendor/requirejs/require.js',
            './app/vendor/modernizr/modernizr.js',
            './app/vendor/q/q.js',
            './app/vendor/underscore/underscore.js',
            './app/vendor/localforage/dist/localforage.js',
            // NOTE: no bower dropbox package exists; the SDK is vendored
            // as helpers/Dropbox-sdk.min.js (see main.js paths). Gulp 3
            // silently skipped this glob; Gulp 5 errors on it.
            './app/vendor/sjcl/sjcl.js',

            // Remotestorage
            './app/vendor/remotestorage.js/release/stable/remotestorage.js',
            './app/vendor/tv4/tv4.js',
            './app/vendor/bluebird/js/browser/bluebird.min.js',
        ], options), plugins, argv)
        .pipe(gulp.dest('./dist/vendor/'));
    }

    function copyMathJax() {
        // Copy MathJax files
        return gulp.src([
            './app/vendor/MathJax/*.js',
            './app/vendor/MathJax/config/TeX-AMS-MML_HTMLorMML.js',
            './app/vendor/MathJax/images/**',
            './app/vendor/MathJax/extensions/**',
            './app/vendor/MathJax/fonts/HTML-CSS/TeX/woff/**',
            './app/vendor/MathJax/jax/element/**',
            './app/vendor/MathJax/jax/input/+(MathML|TeX)/**',
            './app/vendor/MathJax/jax/output/+(HTML-CSS|NativeMML)/**',
            './app/vendor/MathJax/localization/en/**'
        ], options)
        .pipe(gulp.dest('./dist/vendor/'));
    }

    // Pre-minified ES6+ bundles: uglify-js 2.x only speaks ES5,
    // and re-minifying is pointless anyway. Plain copy.
    function copyVendorMin() {
        return gulp.src([
            './app/vendor/markdown-it/dist/browser/markdown-it.umd.min.js',
            './app/vendor/dompurify/dist/purify.min.js',
        ], options)
        .pipe(gulp.dest('./dist/vendor/'));
    }

    return {
        license  : copyLicense,
        appFiles : copyAppFiles,
        excluded : copyExcluded,
        bower    : copyBower,
        mathjax  : copyMathJax,
        vendorMin: copyVendorMin
    };
};
