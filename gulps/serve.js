'use strict';

/**
 * Live reload server (dev only; not part of the build).
 */
module.exports = function(gulp, plugins, argv) {
    return function serveStart(done) {
        plugins.browserSync.init({
            server : (argv.root || 'app'),
            port   : (argv.port || 9000)
        });
        done();
    };
};
