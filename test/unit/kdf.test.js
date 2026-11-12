/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import nodeCrypto from 'crypto';
import {load} from '../helpers/amd.js';

var Kdf, sjcl;

beforeAll(async function() {
    // The helper looks for WebCrypto on `self` (browser, worker)
    global.self = global.self || {crypto: nodeCrypto.webcrypto};

    var mods = await load(['helpers/kdf', 'sjcl']);
    Kdf = mods[0];
    sjcl = mods[1];
});

function hex(bits) {
    return sjcl.codec.hex.fromBits(bits);
}

describe('key stretching', function() {

    // Every existing note was encrypted under a key SJCL derived. The
    // WebCrypto path must give the same bits or nothing opens.
    it('WebCrypto and SJCL derive the same key', async function() {
        var cases = [
            {password: 'correct horse', salt: [1, 2, 3, 4, 5], iter: 10000},
            {password: 'Grüße 日本語 🚀', salt: [-232037467, -1492210592, -419333413, 87726, 5], iter: 1000},
            {password: 'p', salt: 'a string salt', iter: 1000},
            {password: 'empty salt', salt: '', iter: 1000},
            {password: 'x'.repeat(200), salt: sjcl.codec.hex.toBits('00ff10'), iter: 1000},
        ];

        for (var i = 0; i < cases.length; i++) {
            var c = cases[i],
                fast = await Kdf.derive(c.password, c.salt, c.iter, 256),
                slow = Kdf.deriveSync(c.password, c.salt, c.iter, 256);
            expect(hex(fast)).toBe(hex(slow));
            expect(hex(fast)).toHaveLength(64);
        }
    });

    // Independent of both: Node's own PBKDF2
    it('matches a third implementation', async function() {
        var salt = Buffer.from('0000000100000002000000030000000400000005', 'hex'),
            want = nodeCrypto.pbkdf2Sync('correct horse', salt, 10000, 32, 'sha256').toString('hex');

        expect(hex(await Kdf.derive('correct horse', [1, 2, 3, 4, 5], 10000, 256))).toBe(want);
        expect(hex(Kdf.deriveSync('correct horse', [1, 2, 3, 4, 5], 10000, 256))).toBe(want);
    });

    it('falls back to SJCL when there is no WebCrypto', async function() {
        var saved = global.self;
        global.self = {};
        try {
            expect(hex(await Kdf.derive('pw', [1, 2], 1000, 256)))
                .toBe(hex(Kdf.deriveSync('pw', [1, 2], 1000, 256)));
        } finally {
            global.self = saved;
        }
    });
});

describe('password verifier', function() {

    it('is salted, stretched and has the documented form', async function() {
        var a = await Kdf.hash('same password'),
            b = await Kdf.hash('same password');

        expect(a).toMatch(/^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
        expect(Kdf.isVerifier(a)).toBe(true);
        // a fresh salt each time: equal passwords do not look equal
        expect(a).not.toBe(b);
        // and the bare SHA-256 of the password is nowhere in it
        expect(a).not.toContain(hex(sjcl.hash.sha256.hash('same password')));
    }, 30000);

    it('accepts the right password and only that, on both paths', async function() {
        var verifier = await Kdf.hash('right one');

        expect(await Kdf.verify('right one', verifier)).toBe(true);
        expect(await Kdf.verify('wrong one', verifier)).toBe(false);
        expect(await Kdf.verify('', verifier)).toBe(false);
        expect(Kdf.verifySync('right one', verifier)).toBe(true);
        expect(Kdf.verifySync('Right one', verifier)).toBe(false);

        // made by SJCL, checked by WebCrypto
        var made = Kdf.hashSync('other way round');
        expect(await Kdf.verify('other way round', made)).toBe(true);
    }, 60000);

    it('rejects a verifier that was altered', async function() {
        var verifier = await Kdf.hash('pw'),
            parts    = verifier.split('$');

        parts[3] = (parts[3][0] === '0' ? '1' : '0') + parts[3].slice(1);
        expect(await Kdf.verify('pw', parts.join('$'))).toBe(false);
        expect(Kdf.isVerifier('pbkdf2-sha256$600000$zz$' + 'a'.repeat(64))).toBe(false);
        expect(Kdf.isVerifier('just a password')).toBe(false);
    }, 30000);

    // Profiles made up to 0.8.0-rc2 store SHA-256(password) as SJCL's
    // eight words. These exact numbers were read from such a profile
    // whose password was "second-pass".
    it('still accepts the verifier of an existing profile', async function() {
        var legacy = sjcl.hash.sha256.hash('second-pass');

        expect(legacy.slice(0, 3)).toEqual([205744345, 1142117747, -1115253717]);
        expect(Kdf.isLegacy(legacy)).toBe(true);
        expect(Kdf.isVerifier(legacy)).toBe(false);

        expect(await Kdf.verify('second-pass', legacy)).toBe(true);
        expect(await Kdf.verify('first-pass', legacy)).toBe(false);
        expect(Kdf.verifySync('second-pass', legacy)).toBe(true);
        expect(Kdf.verifySync('first-pass', legacy)).toBe(false);

        // as it comes back from JSON (an export, the config store)
        expect(await Kdf.verify('second-pass', JSON.parse(JSON.stringify(legacy)))).toBe(true);
    });

    it('nothing stored verifies nothing', async function() {
        expect(await Kdf.verify('pw', '')).toBe(false);
        expect(await Kdf.verify('pw', undefined)).toBe(false);
        expect(Kdf.verifySync('pw', [])).toBe(false);
        expect(Kdf.verifySync('', '')).toBe(false);
    });
});
