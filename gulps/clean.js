'use strict';

/**
 * Tasks for cleaning up.
 */
module.exports = function(gulp, plugins) {

    function cleanDist() {
        return plugins.del(['./dist']);
    }

    function cleanRelease() {
        return plugins.del(['./release/*']);
    }

    return {
        dist    : cleanDist,
        release : cleanRelease
    };

};
