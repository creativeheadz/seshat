'use strict';
var fs     = require('fs'),
    path   = require('path'),
    crypto = require('crypto');

/**
 * Generate HTML5 cache manifest file.
 *
 * Hand-rolled: the gulp-manifest plugin is abandoned (0.1.1, 2014)
 * and emits non-Vinyl objects under Gulp 5. Output format matches
 * the 2017 static-laverna app.appcache byte for byte in structure
 * (CACHE MANIFEST, Time comment, CACHE/NETWORK/FALLBACK/SETTINGS
 * sections, trailing content hash).
 */
function walk(dir, base, files) {
    fs.readdirSync(dir).forEach(function(name) {
        // Skip dotfiles: the old `dist/**` glob never matched them.
        if (name.charAt(0) === '.') {
            return;
        }
        var full = path.join(dir, name),
            rel  = path.relative(base, full).split(path.sep).join('/');
        if (fs.statSync(full).isDirectory()) {
            walk(full, base, files);
        }
        else {
            files.push(rel);
        }
    });
}

module.exports = function() {
    return function htmlManifest(done) {
        var base  = path.resolve('./dist'),
            files = [];

        walk(base, base, files);

        files = files.filter(function(rel) {
            return rel !== 'app.appcache' &&
                rel !== 'dropbox.html' &&
                rel !== 'bower_components/MathJax' &&
                rel.indexOf('bower_components/MathJax/') !== 0;
        });

        var hash = crypto.createHash('sha256');
        files.forEach(function(rel) {
            hash.update(rel + '\0');
            hash.update(fs.readFileSync(path.join(base, rel)));
        });

        var out = [
            'CACHE MANIFEST',
            '# Time: ' + new Date().toString(),
            '',
            'CACHE:'
        ]
        .concat(files)
        .concat([
            '',
            'NETWORK:',
            '*',
            '',
            'FALLBACK:',
            '/ 404.html',
            '',
            'SETTINGS:',
            'prefer-online',
            '',
            '# hash: ' + hash.digest('hex')
        ])
        .join('\n');

        fs.writeFileSync(path.join(base, 'app.appcache'), out);
        done();
    };
};
