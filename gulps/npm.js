'use strict';

module.exports = function(gulp, plugins) {

    gulp.task('npm:install', function() {
        return gulp.src('./release/seshat/package.json')
        .pipe(plugins.shell(
            'cd ./release/seshat && npm install --production && cd ../../'
        ));
    });

};
