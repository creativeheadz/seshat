'use strict';

// Dry-run the vault importer against a real vault directory WITHOUT
// writing anything: validates scale, mapping coverage and wikilink
// resolution. Usage: node scripts/vault-soak.js /path/to/vault
//
// Loads the real AMD mapper/runner plus the node test source.

var path = require('path');

var amd = require('../test/helpers/amd.js'),
    nodeSource = require('../test/helpers/vaultNode.js').makeNodeSource;

function countingWriter() {
    var state = {notes: 0, notebooks: {}, bytes: 0};
    return {
        state: state,
        findNotebook: function(name, parentId) {
            var key = parentId + '/' + name;
            return Promise.resolve(state.notebooks[key] || null);
        },
        saveNotebook: function(attrs) {
            state.notebooks[attrs.parentId + '/' + attrs.name] = attrs.id;
            return Promise.resolve(attrs.id);
        },
        saveNote: function(attrs) {
            state.notes++;
            state.bytes += attrs.content.length;
            return Promise.resolve();
        },
    };
}

var vaultDir = process.argv[2];
if (!vaultDir) {
    console.error('usage: node scripts/vault-soak.js /path/to/vault');
    process.exit(2);
}

var started = Date.now();
amd.load(['modules/importExport/vault/runner']).then(function(mods) {
    var runner = mods[0],
        writer = countingWriter(),
        lastPct = -1;

    return runner.run(nodeSource(vaultDir), writer, {
        batchSize: 100,
        onProgress: function(state) {
            var pct = Math.round(state.done / state.total * 100);
            if (pct !== lastPct && pct % 10 === 0) {
                lastPct = pct;
                console.log('progress: ' + state.done + '/' + state.total);
            }
        },
    }).then(function(summary) {
        console.log(JSON.stringify({
            seconds   : Math.round((Date.now() - started) / 100) / 10,
            notes     : summary.notes,
            notebooks: summary.notebooks,
            skipped   : summary.skipped,
            embeds    : summary.embeds,
            unresolved: summary.unresolved,
            resolved  : summary.resolved,
            written   : writer.state.notes,
            bytesMB   : Math.round(writer.state.bytes / 1048576 * 10) / 10,
        }, null, 1));
    });
}).catch(function(err) {
    console.error('SOAK FAIL:', err && err.stack || err);
    process.exit(1);
});
