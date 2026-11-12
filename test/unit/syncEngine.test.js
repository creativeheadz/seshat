/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import {load} from '../helpers/amd.js';

var Engine;

beforeAll(async function() {
    Engine = (await load(['modules/sync/engine']))[0];
});

/**
 * Two (or three) devices and a dumb remote folder, in memory. Each
 * device runs the real engine; the "transport" is copying files,
 * exactly what rsync does. A device's sync is: look at the remote,
 * plan, act, write back.
 */
function Device(name) {
    this.name  = name;
    this.notes = {};      // id -> record, as the local store holds it
    this.state = {};      // id -> {rev, local, ancestors}
    this.copies = 0;
}

Device.prototype.write = function(id, content, updated) {
    this.notes[id] = {id: id, content: content, updated: updated};
};

Device.prototype.sync = function(remote, options) {
    var self = this, local = {}, there = {};

    Object.keys(this.notes).forEach(function(id) {
        local[id] = {hash: Engine.hash(self.notes[id]), updated: self.notes[id].updated};
    });
    Object.keys(remote).forEach(function(id) {
        var file = Engine.unpack(remote[id]);
        if (file) {
            there[id] = {rev: file.rev, ancestors: file.ancestors, updated: file.record.updated};
        }
    });

    var plan = Engine.plan(local, there, this.state, options || {keepBoth: true});

    plan.forEach(function(step) {
        var id = step.id, file;

        if (step.action === 'push') {
            file = Engine.pack(self.notes[id], self.state[id], self.name);
            remote[id] = JSON.stringify(file);
            self.state[id] = {rev: file.rev, local: file.rev, ancestors: file.ancestors};
        }
        else if (step.action === 'pull' || step.action === 'conflict') {
            if (step.action === 'conflict') {
                // the local version lives on under an id of its own
                self.copies++;
                var copyId = id + '-copy-' + self.name + '-' + self.copies;
                self.notes[copyId] = {id: copyId, content: self.notes[id].content, updated: self.notes[id].updated};
            }
            file = Engine.unpack(remote[id]);
            self.notes[id] = JSON.parse(JSON.stringify(file.record));
            self.state[id] = {rev: file.rev, local: Engine.hash(self.notes[id]), ancestors: file.ancestors};
        }
        else if (step.action === 'link') {
            file = Engine.unpack(remote[id]);
            self.state[id] = {rev: file.rev, local: local[id].hash, ancestors: file.ancestors};
        }
        else if (step.action === 'forget') {
            delete self.state[id];
        }
    });

    return plan;
};

// Every piece of text any device ever wrote must still exist somewhere
function allContents(devices) {
    var seen = {};
    devices.forEach(function(d) {
        Object.keys(d.notes).forEach(function(id) { seen[d.notes[id].content] = true; });
    });
    return Object.keys(seen).sort();
}

describe('sync engine: one record', function() {

    it('hashes equal records equally whatever the key order', function() {
        expect(Engine.hash({id: 'a', b: 1, c: [1, {x: 1, y: 2}]}))
            .toBe(Engine.hash({c: [1, {y: 2, x: 1}], b: 1, id: 'a'}));
        expect(Engine.hash({id: 'a', b: 1})).not.toBe(Engine.hash({id: 'a', b: 2}));
        expect(Engine.hash({id: 'a'})).toMatch(/^[0-9a-f]{64}$/);
    });

    it('refuses a file that is cut short, edited or not a record', function() {
        var file = Engine.pack({id: 'n1', content: 'text', updated: 5}, null, 'dev');

        expect(Engine.unpack(JSON.stringify(file)).record.content).toBe('text');
        expect(Engine.unpack(JSON.stringify(file).slice(0, -10))).toBeNull();
        expect(Engine.unpack('')).toBeNull();
        expect(Engine.unpack('{"hello": "world"}')).toBeNull();

        var edited = JSON.parse(JSON.stringify(file));
        edited.record.content = 'changed on the server';
        expect(Engine.unpack(JSON.stringify(edited))).toBeNull();
    });

    it('keeps a bounded history in each file', function() {
        var state = null, file;
        for (var i = 0; i < 80; i++) {
            file  = Engine.pack({id: 'n', content: 'v' + i}, state, 'dev');
            state = {rev: file.rev, local: file.rev, ancestors: file.ancestors};
        }
        expect(file.ancestors).toHaveLength(Engine.MAX_ANCESTORS);
        expect(new Set(file.ancestors).size).toBe(Engine.MAX_ANCESTORS);
    });

    it('decides every combination of here, there and remembered', function() {
        var d = Engine.decide,
            L = function(hash, updated) { return {hash: hash, updated: updated || 1}; },
            R = function(rev, ancestors, updated) { return {rev: rev, ancestors: ancestors || [], updated: updated || 1}; },
            S = function(rev, local) { return {rev: rev, local: local, ancestors: []}; };

        expect(d(null, null, null, true)).toBe('none');
        expect(d(null, null, S('a', 'a'), true)).toBe('forget');
        expect(d(L('a'), null, null, true)).toBe('push');
        expect(d(L('a'), null, S('a', 'a'), true)).toBe('push');      // remote was emptied
        expect(d(null, R('a'), null, true)).toBe('pull');
        expect(d(null, R('a'), S('a', 'a'), true)).toBe('pull');

        expect(d(L('a'), R('a'), S('a', 'a'), true)).toBe('none');
        expect(d(L('b'), R('a'), S('a', 'a'), true)).toBe('push');     // edited here
        expect(d(L('a'), R('b', ['a']), S('a', 'a'), true)).toBe('pull');  // edited there
        expect(d(L('a'), R('c', ['b', 'a']), S('a', 'a'), true)).toBe('pull');  // several steps on
        expect(d(L('b'), R('c', ['a']), S('a', 'a'), true)).toBe('conflict');  // edited on both
        expect(d(L('a'), R('c', ['x']), S('a', 'a'), true)).toBe('conflict');  // remote never saw ours
        expect(d(L('c'), R('c', ['a']), S('a', 'a'), true)).toBe('link');      // same edit on both

        // re-encrypted on arrival: the local bytes differ from the rev
        // but are what we remembered, so nothing has changed here
        expect(d(L('a-local'), R('a'), S('a', 'a-local'), true)).toBe('none');
        expect(d(L('a-local'), R('b', ['a']), S('a', 'a-local'), true)).toBe('pull');

        // no shared past
        expect(d(L('a', 5), R('b', [], 5), null, true)).toBe('pull');
        expect(d(L('a', 5), R('b', [], 9), null, true)).toBe('conflict');
        expect(d(L('a'), R('a'), null, true)).toBe('link');

        // notebooks and tags: the newer wins, no copies
        expect(d(L('b', 9), R('c', ['a'], 5), S('a', 'a'), false)).toBe('push');
        expect(d(L('b', 5), R('c', ['a'], 9), S('a', 'a'), false)).toBe('pull');
    });
});

describe('sync engine: devices and a dumb folder', function() {

    it('a second device receives what the first one wrote', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        a.write('n1', 'first note', 1);
        a.sync(remote);
        b.sync(remote);

        expect(b.notes.n1.content).toBe('first note');
        expect(a.sync(remote)).toEqual([]);
        expect(b.sync(remote)).toEqual([]);
    });

    it('an edit travels both ways and then everything is quiet', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        a.write('n1', 'v1', 1);
        a.sync(remote); b.sync(remote);

        b.write('n1', 'v2 from b', 2);
        b.sync(remote); a.sync(remote);
        expect(a.notes.n1.content).toBe('v2 from b');

        a.write('n1', 'v3 from a', 3);
        a.sync(remote); b.sync(remote);
        expect(b.notes.n1.content).toBe('v3 from a');

        expect(a.sync(remote)).toEqual([]);
        expect(b.sync(remote)).toEqual([]);
        expect(Object.keys(a.notes)).toEqual(['n1']);
    });

    it('edits on both devices keep both versions', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        a.write('n1', 'v1', 1);
        a.sync(remote); b.sync(remote);

        a.write('n1', 'edited on a', 2);
        b.write('n1', 'edited on b', 3);
        a.sync(remote);
        var plan = b.sync(remote);

        expect(plan).toEqual([{id: 'n1', action: 'conflict'}]);
        expect(b.notes.n1.content).toBe('edited on a');
        expect(allContents([b])).toEqual(['edited on a', 'edited on b']);

        // the copy is an ordinary note and reaches the other device
        b.sync(remote); a.sync(remote);
        expect(allContents([a])).toEqual(['edited on a', 'edited on b']);
        expect(a.sync(remote)).toEqual([]);
        expect(b.sync(remote)).toEqual([]);
    });

    // The race a dumb folder cannot prevent: both devices look, then
    // both upload, and the second upload replaces the first.
    it('an upload overwritten by another device is not lost', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        a.write('n1', 'v1', 1);
        a.sync(remote); b.sync(remote);

        // both edit, both sync against the same picture of the remote
        a.write('n1', 'from a', 2);
        b.write('n1', 'from b', 3);
        var seenByA = JSON.parse(JSON.stringify(remote)),
            seenByB = JSON.parse(JSON.stringify(remote));
        a.sync(seenByA);
        b.sync(seenByB);
        // b's upload lands last
        remote.n1 = seenByB.n1;

        // a believes its version is on the remote; it is not
        var plan = a.sync(remote);
        expect(plan).toEqual([{id: 'n1', action: 'conflict'}]);
        expect(allContents([a])).toEqual(['from a', 'from b']);

        a.sync(remote); b.sync(remote);
        expect(allContents([b])).toEqual(['from a', 'from b']);
        expect(a.sync(remote)).toEqual([]);
        expect(b.sync(remote)).toEqual([]);
    });

    it('a device that re-encrypts what it receives does not send it back', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        a.write('n1', 'v1', 1);
        a.sync(remote);

        // b stores it differently from how it arrived (a new IV)
        b.sync(remote);
        b.notes.n1.iv = 'b-local-iv';
        b.state.n1.local = Engine.hash(b.notes.n1);

        expect(b.sync(remote)).toEqual([]);
        expect(a.sync(remote)).toEqual([]);

        // and still follows later edits
        a.write('n1', 'v2', 2);
        a.sync(remote);
        expect(b.sync(remote)).toEqual([{id: 'n1', action: 'pull'}]);
        expect(b.notes.n1.content).toBe('v2');
    });

    it('two devices that already hold the same notes meet without doubling them', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        // the same backup restored on both
        a.write('n1', 'same', 7); b.write('n1', 'same', 7);
        // one of them encrypted it its own way
        b.notes.n1.iv = 'other';

        a.sync(remote);
        var plan = b.sync(remote);
        expect(plan).toEqual([{id: 'n1', action: 'pull'}]);
        expect(Object.keys(b.notes)).toEqual(['n1']);
    });

    it('a wiped remote is filled again, not obeyed', function() {
        var remote = {}, a = new Device('a');

        a.write('n1', 'kept', 1);
        a.sync(remote);
        delete remote.n1;

        expect(a.sync(remote)).toEqual([{id: 'n1', action: 'push'}]);
        expect(a.notes.n1.content).toBe('kept');
        expect(Engine.unpack(remote.n1).record.content).toBe('kept');
    });

    it('a damaged file on the remote is ignored and replaced', function() {
        var remote = {}, a = new Device('a'), b = new Device('b');

        a.write('n1', 'good', 1);
        a.sync(remote); b.sync(remote);
        remote.n1 = remote.n1.slice(0, 40);

        expect(b.sync(remote)).toEqual([{id: 'n1', action: 'push'}]);
        expect(b.notes.n1.content).toBe('good');
        expect(a.sync(remote)).toEqual([]);
    });

    // Whatever three devices do, in whatever order they sync:
    // they end up agreeing, and no version is dropped. A version may
    // only disappear if someone who had it in front of them wrote
    // over it; every other version must still exist at the end,
    // under its own id or as a copy.
    it('random edits and sync orders never lose a version and always settle', function() {
        var seed = 20261112;
        function rnd(n) {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return Math.floor(seed / 4294967296 * n);
        }

        var conflicts = 0;

        for (var round = 0; round < 300; round++) {
            var remote = {}, devices = [new Device('a'), new Device('b'), new Device('c')],
                written = [], replacedByAuthor = {}, clock = 1;

            for (var step = 0; step < 40; step++) {
                var device = devices[rnd(3)];

                if (rnd(3) === 0) {
                    device.sync(remote).forEach(function(s) {
                        if (s.action === 'conflict') { conflicts++; }
                    });
                    continue;
                }

                var ids  = Object.keys(device.notes),
                    id   = ids.length && rnd(3) ? ids[rnd(ids.length)] : 'n' + rnd(4),
                    text = device.name + ' wrote ' + round + '.' + step;

                if (device.notes[id]) {
                    replacedByAuthor[device.notes[id].content] = true;
                }
                device.write(id, text, clock++);
                written.push(text);
            }

            // let everything settle
            for (var pass = 0; pass < 8; pass++) {
                devices.forEach(function(d) { d.sync(remote); });
            }
            expect(devices.every(function(d) { return d.sync(remote).length === 0; }),
                'round ' + round + ' did not settle').toBe(true);

            // they agree
            var pictures = devices.map(function(d) {
                return JSON.stringify(Object.keys(d.notes).sort().map(function(id) {
                    return [id, d.notes[id].content];
                }));
            });
            expect(pictures[1]).toBe(pictures[0]);
            expect(pictures[2]).toBe(pictures[0]);

            // nothing was dropped
            var survived = allContents(devices);
            written.forEach(function(text) {
                if (!replacedByAuthor[text]) {
                    expect(survived, 'round ' + round + ' lost "' + text + '"').toContain(text);
                }
            });
        }

        // the run did exercise conflicts
        expect(conflicts).toBeGreaterThan(100);
    });
});
