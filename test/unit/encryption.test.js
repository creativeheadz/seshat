/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import {describe, it, expect, beforeAll} from 'vitest';
import {load} from '../helpers/amd.js';

// Mirrors the app's real config shape (strings; salt is a 5-word
// array produced by firstStart via encrypt/randomize).
var CONFIGS = {
    encrypt        : '1',
    encryptIter    : '10000',
    encryptTag     : '128',
    encryptKeySize : '256',
    encryptSalt    : [11, 22, 33, 44, 55],
};

var Sjcl, sjcl, crypto;

beforeAll(async function() {
    var mods = await load(['classes/sjcl', 'sjcl']);
    Sjcl = mods[0];
    sjcl = mods[1];
    crypto = new Sjcl();
});

function derive(password) {
    return crypto.deriveKey({configs: CONFIGS, password: password || 'correct horse'});
}

describe('sjcl adapter', function() {

    it('derives a stable PBKDF2 key', function() {
        var a = derive(),
            b = derive();
        expect(a.hexKey).toBe(b.hexKey);
        expect(a.key.length).toBe(8); // 256 bits
        expect(a.hexKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('round-trips a string', function() {
        var keys = derive(),
            iv   = [1, 2, 3, 4],
            ct   = crypto.encrypt({configs: CONFIGS, string: 'hello notes', keys: keys, iv: iv});
        expect(ct).not.toBe('hello notes');
        expect(crypto.decrypt({configs: CONFIGS, string: ct, keys: keys})).toBe('hello notes');
    });

    it('round-trips an object (model shape)', function() {
        var keys = derive(),
            iv   = [5, 6, 7, 8],
            data = {title: 't', content: '# hi', tags: ['a']},
            ct   = crypto.encrypt({configs: CONFIGS, string: data, keys: keys, iv: iv});
        expect(JSON.parse(crypto.decrypt({configs: CONFIGS, string: ct, keys: keys}))).toEqual(data);
    });

    it('produces different ciphertexts for random IVs', function() {
        var keys = derive(),
            a = crypto.encrypt({configs: CONFIGS, string: 'same', keys: keys, iv: sjcl.random.randomWords(4, 0)}),
            b = crypto.encrypt({configs: CONFIGS, string: 'same', keys: keys, iv: sjcl.random.randomWords(4, 0)});
        expect(a).not.toBe(b);
        expect(crypto.decrypt({configs: CONFIGS, string: a, keys: keys})).toBe('same');
        expect(crypto.decrypt({configs: CONFIGS, string: b, keys: keys})).toBe('same');
    });

    it('passes data through when encryption is disabled', function() {
        var off = Object.assign({}, CONFIGS, {encrypt: 0});
        expect(crypto.encrypt({configs: off, string: 'plain'})).toBe('plain');
        expect(crypto.decrypt({configs: off, string: 'plain'})).toBe('plain');
    });

    it('rejects decryption with the wrong password', function() {
        var keys = derive('right'),
            bad  = derive('wrong'),
            ct   = crypto.encrypt({configs: CONFIGS, string: 'secret', keys: keys, iv: [9, 9, 9, 9]});
        expect(function() {
            crypto.decrypt({configs: CONFIGS, string: ct, keys: bad});
        }).toThrow();
    });

    // Frozen vectors. Params: password 'legacy-vector', iters 10000,
    // tag 128, keysize 256, salt words [11, 22, 33, 44, 55].
    // Generated once with this same code; they pin the legacy-reader
    // contract (a KDF uplift must keep decrypting these).
    it('decrypts a frozen v0.7.51-era payload', function() {
        var ct = '{"iv":"AAAAFQAAABYAAAAXAAAAGA==","v":1,"iter":10000,' +
            '"ks":256,"ts":128,"mode":"ccm","adata":"","cipher":"aes",' +
            '"salt":"AAAACwAAABYAAAAhAAAALAAAADc=",' +
            '"ct":"mfVFt6ykFApBlmaZM/O6QNkx1dtyZG7Dtfoq"}';
        var keys = crypto.deriveKey({configs: CONFIGS, password: 'legacy-vector'});
        expect(crypto.decrypt({configs: CONFIGS, string: ct, keys: keys})).toBe('frozen note');
    });

    it('decrypts a frozen legacy (<9 field) payload', function() {
        var legacyConfigs = Object.assign({}, CONFIGS, {
            encryptSalt: 'AAAACwAAABYAAAAhAAAALAAAADc=',
        });
        var ct = '{"iv":"AAAAHwAAACAAAAAhAAAAIg==",' +
            '"ct":"F1SghVulPEt9ygDrF6OCsSqmIDrybcllDyyl"}';
        var keys = crypto.deriveKey({configs: legacyConfigs, password: 'legacy-vector'});
        expect(crypto.decryptLegacy({configs: legacyConfigs, string: ct, keys: keys}))
            .toBe('legacy note');
    });

    it('returns plaintext untouched when it was never encrypted', function() {
        var keys = derive();
        expect(crypto.decrypt({configs: CONFIGS, string: 'Hello', keys: keys})).toBe('Hello');
    });

    it('exposes hex, toUpperCase, getConfigs, and pbkdf2-compatible deriveKey', async function() {
        var mods = await load(['underscore']),
            _ = mods[0];
        var rand = sjcl.random.randomWords(4, 0),
            hex = crypto.hex(rand);
        expect(typeof hex).toBe('string');
        expect(crypto.toUpperCase(hex)).toMatch(/^[A-F0-9 ]*$/);

        var c = crypto.getConfigs(CONFIGS);
        expect(c.mode).toBe('ccm');
        expect(c.cipher).toBe('aes');
        expect(c.iter).toBe(Number(CONFIGS.encryptIter));

        var p = crypto.deriveKey({password: 'k', configs: CONFIGS}),
            raw = sjcl.misc.pbkdf2('k', CONFIGS.encryptSalt,
                Number(CONFIGS.encryptIter), Number(CONFIGS.encryptKeySize));
        expect(_.isEqual(p.key, raw)).toBe(true);
    });

    // Ported from the karma spec (test/spec/classes/sjcl.js, v0.6.2 and
    // v0.7.0 wire formats). Dynamic by design: they pin the algorithms,
    // the frozen vectors above pin exact bytes.
    it('decrypts v0.6.2 payloads (10 fields, comma-string key)', function() {
        var str = 'My secret note',
            keys = derive('my secret key #1'),
            encrypted = sjcl.encrypt(keys.key.toString(), str, {
                iter : Number(CONFIGS.encryptIter),
                ts   : Number(CONFIGS.encryptTag),
                ks   : Number(CONFIGS.encryptKeySize),
                iv   : sjcl.random.randomWords(4, 0),
            });
        expect(Object.keys(JSON.parse(encrypted)).length).toBe(10);
        expect(crypto.decryptLegacy({string: encrypted, configs: CONFIGS, keys: keys}))
            .toBe(str);
    });

    it('decrypts v0.7.0 payloads (2 fields, uppercased hex key)', async function() {
        var mods = await load(['underscore']),
            _ = mods[0],
            salt = crypto.toUpperCase(crypto.hex(sjcl.random.randomWords(4, 0))),
            strConfigs = Object.assign({}, CONFIGS, {encryptSalt: salt}),
            keys = crypto.deriveKey({password: 'my secret key #1', configs: strConfigs}),
            full = JSON.parse(sjcl.encrypt(crypto.toUpperCase(keys.hexKey), 'My secret note', {
                mode: 'ccm', iter: Number(CONFIGS.encryptIter), ts: Number(CONFIGS.encryptTag),
                ks: Number(CONFIGS.encryptKeySize), salt: salt, v: 1, adata: '',
                cipher: 'aes', iv: sjcl.random.randomWords(4, 0),
            })),
            encrypted = JSON.stringify(_.pick(full, 'ct', 'iv'));
        expect(Object.keys(JSON.parse(encrypted)).length).toBe(2);
        expect(crypto.decryptLegacy({string: encrypted, configs: strConfigs, keys: keys}))
            .toBe('My secret note');
    });

    it('hashes with sha256 and passes empty strings through', async function() {
        expect(await crypto.sha256('')).toBe('');
        var h1 = await crypto.sha256('abc'),
            h2 = await crypto.sha256('abc');
        expect(h1.length).toBe(8);
        expect(h1).toEqual(h2);
    });
});
