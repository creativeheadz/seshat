'use strict';

/**
 * Generate app/styles/core/icons.less.
 *
 * The interface icons are Phosphor outlines (MIT,
 * https://phosphoricons.com) drawn through CSS masks, so they take
 * the text colour and stay sharp at any size. Class names are the
 * ones the templates already use (the old fontello names), which
 * is why some read oddly: `icon-doc-new` is a plus, `icon-globe` a
 * link. New names sit at the end of the map.
 *
 * The favourite star is ours: Seshat's seven-pointed star.
 *
 * Run `npm run icons` after editing the map. The output is checked
 * in, so the build itself never needs the icon package.
 */
var fs   = require('fs'),
    path = require('path');

var ROOT   = path.resolve(__dirname, '..'),
    ASSETS = path.join(ROOT, 'node_modules', '@phosphor-icons', 'core', 'assets'),
    OUT    = path.join(ROOT, 'app', 'styles', 'core', 'icons.less'),
    WEIGHT = 'regular';

// class suffix -> Phosphor icon
var map = {
    'search'         : 'magnifying-glass',
    'arrows'         : 'arrows-clockwise',
    'align-justify'  : 'text-align-justify',
    'trashed'        : 'trash',
    'cog'            : 'gear-six',
    'cloud'          : 'cloud',
    'notebook'       : 'notebook',
    'bold'           : 'text-b',
    'italic'         : 'text-italic',
    'globe'          : 'link',
    'indent'         : 'keyboard',
    'code'           : 'code',
    'picture'        : 'image',
    'list-numbered'  : 'list-numbers',
    'list-bullet'    : 'list-bullets',
    'font'           : 'text-h',
    'minus'          : 'minus',
    'reply'          : 'arrow-counter-clockwise',
    'share'          : 'arrow-clockwise',
    'save'           : 'check',
    'fullscreen'     : 'arrows-out',
    'eye'            : 'eye',
    'undo'           : 'arrow-u-up-left',
    'squares'        : 'sidebar-simple',
    'pencil'         : 'pencil-simple',
    'tag'            : 'tag',
    'note'           : 'note',
    'lock'           : 'lock',
    'lock-open'      : 'lock-open',
    'lock-open-alt'  : 'lock-open',
    'block'          : 'x',
    'github-circled' : 'github-logo',
    'key'            : 'key',
    'ok'             : 'check',
    'ok-squared'     : 'check-square',
    'check'          : 'check-square',
    'check-empty'    : 'square',
    'help-circled'   : 'question',
    'doc-new'        : 'plus',
    'left-open-big'  : 'caret-left',
    'right-open-big' : 'caret-right',
    'left-open'      : 'caret-left',
    'right-open'     : 'caret-right',
    'menu'           : 'list',
    'user'           : 'user',

    // Added with the 2026 redesign
    'tasks'          : 'list-checks',
    'rows'           : 'rows',
    'lines'          : 'list',
    'down-open'      : 'caret-down',
    'dots'           : 'dots-three',
    'close'          : 'x',
    'transfer'       : 'download-simple',
    'modules'        : 'stack',
    'profiles'       : 'user',
    'language'       : 'text-aa',
    'columns'        : 'columns'
};

function encode(svg) {
    return svg
    .replace(/\s+/g, ' ')
    .replace(/"/g, '\'')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/#/g, '%23');
}

function phosphor(name) {
    var file = path.join(ASSETS, WEIGHT, name + (WEIGHT === 'regular' ? '' : '-' + WEIGHT) + '.svg');
    if (!fs.existsSync(file)) {
        console.error('icons: no Phosphor icon named ' + name);
        process.exit(1);
    }
    return fs.readFileSync(file, 'utf8')
    .replace(' fill="currentColor"', '')
    .trim();
}

/**
 * Seven-pointed star on the same 256 grid. The centre sits a
 * little below the middle because a seven-pointed star has one
 * point up and two down.
 */
function star(filled) {
    var cx = 128, cy = 133, outer = 104, inner = 46, pts = [];

    for (var i = 0; i < 14; i++) {
        var r = i % 2 === 0 ? outer : inner,
            a = -Math.PI / 2 + i * Math.PI / 7;
        pts.push(
            (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)
        );
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
        '<polygon points="' + pts.join(' ') + '" fill="' + (filled ? 'black' : 'none') +
        '" stroke="black" stroke-width="14" stroke-linejoin="round"/></svg>';
}

/**
 * The emblem: the star inside the upturned arc, as in the logo.
 */
function emblem() {
    var cx = 128, cy = 106, outer = 62, inner = 25, pts = [];

    for (var i = 0; i < 14; i++) {
        var r = i % 2 === 0 ? outer : inner,
            a = -Math.PI / 2 + i * Math.PI / 7;
        pts.push(
            (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)
        );
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
        '<polygon points="' + pts.join(' ') + '" fill="black" stroke="black" ' +
        'stroke-width="8" stroke-linejoin="round"/>' +
        '<path d="M44,100V134a84,84,0,0,0,168,0V100" fill="none" stroke="black" ' +
        'stroke-width="14" stroke-linecap="round"/></svg>';
}

function rule(name, svg) {
    return '.icon-' + name + ':before { --icon: url("data:image/svg+xml,' + encode(svg) + '"); }';
}

var out = [
    '// Generated by scripts/icons.js. Do not edit; change the map there.',
    '// Outlines: Phosphor Icons (MIT). Star: Seshat.',
    '',
    '[class^="icon-"]:before,',
    '[class*=" icon-"]:before {',
    '    content        : \'\';',
    '    display        : inline-block;',
    '    width          : 1.25em;',
    '    height         : 1.25em;',
    '    vertical-align : -0.28em;',
    '    background     : currentColor;',
    '    -webkit-mask   : var(--icon) center / contain no-repeat;',
    '    mask           : var(--icon) center / contain no-repeat;',
    '}',
    '',
    '// `icon--block` is a layout helper, not a glyph',
    '.icon--block:before {',
    '    display: block;',
    '    margin : 0 auto 4px;',
    '}',
    ''
];

Object.keys(map).forEach(function(name) {
    out.push(rule(name, phosphor(map[name])));
});

// Order matters: a favourite carries both classes
out.push(rule('star-empty', star(false)));
out.push(rule('favorite', star(true)));
out.push(rule('seshat', emblem()));

out.push(
    '',
    '.animate-spin:before {',
    '    animation: icon-spin 1.2s infinite linear;',
    '}',
    '@keyframes icon-spin {',
    '    from { transform: rotate(0deg); }',
    '    to   { transform: rotate(360deg); }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '    .animate-spin:before { animation-duration: 6s; }',
    '}',
    ''
);

fs.writeFileSync(OUT, out.join('\n'));
console.log('icons: ' + (Object.keys(map).length + 3) + ' glyphs -> app/styles/core/icons.less');
