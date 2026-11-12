/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define, self */
define([
    'underscore',
    'q',
    'sjcl'
], function(_, Q, sjcl) {
    'use strict';

    /**
     * Key stretching, and the stored password check built on it.
     *
     * PBKDF2-HMAC-SHA256 throughout, which is what SJCL has always
     * used here. Where the browser offers WebCrypto it does the work
     * (about ten times faster, off the main thread); SJCL is the
     * fallback and gives the same bits, which test/unit/kdf.test.js
     * holds it to.
     *
     * The password check ("verifier") is what the app compares a
     * typed password against before trying to use it:
     *
     *   pbkdf2-sha256$<iterations>$<salt, hex>$<hash, hex>
     *
     * Until 0.8.0-rc2 it was a bare, unsalted SHA-256 of the password
     * (stored as SJCL's array of eight words, and written into every
     * export). Whoever held the database or an export could try
     * passwords at SHA-256 speed and never meet the key stretching.
     * Old verifiers are still accepted, and replaced with the new
     * form the next time the right password unlocks the profile.
     */
    var PREFIX     = 'pbkdf2-sha256',
        ITERATIONS = 600000,
        pattern    = /^pbkdf2-sha256\$(\d{1,9})\$([0-9a-f]{16,128})\$([0-9a-f]{64})$/;

    function subtle() {
        var scope = typeof self !== 'undefined' ? self :
            (typeof window !== 'undefined' ? window : {});

        return (scope.crypto && scope.crypto.subtle) || null;
    }

    function hexToBytes(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    // Bytes of a password or a salt, as SJCL would read it: a string
    // is UTF-8, anything else is one of its bit arrays.
    function toBytes(value) {
        var bits = typeof value === 'string' ? sjcl.codec.utf8String.toBits(value) : value;
        return hexToBytes(sjcl.codec.hex.fromBits(bits));
    }

    function randomSalt() {
        var scope = typeof self !== 'undefined' ? self :
            (typeof window !== 'undefined' ? window : {});

        if (scope.crypto && scope.crypto.getRandomValues) {
            var bytes = scope.crypto.getRandomValues(new Uint8Array(16));
            return _.map(bytes, function(b) {
                return (b < 16 ? '0' : '') + b.toString(16);
            }).join('');
        }

        return sjcl.codec.hex.fromBits(sjcl.random.randomWords(4, 0));
    }

    function parse(verifier) {
        var m = typeof verifier === 'string' ? pattern.exec(verifier) : null;
        return m ? {iter: Number(m[1]), salt: m[2], hash: m[3]} : null;
    }

    // Compare without stopping at the first difference
    function same(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        var diff = 0;
        for (var i = 0; i < a.length; i++) {
            diff += a.charCodeAt(i) === b.charCodeAt(i) ? 0 : 1;
        }
        return diff === 0;
    }

    var Kdf = {

        ITERATIONS : ITERATIONS,
        PREFIX     : PREFIX,

        /**
         * PBKDF2-HMAC-SHA256 with SJCL. Blocks while it works: about a
         * second for 600,000 iterations.
         * @return {Array} SJCL bit array
         */
        deriveSync: function(password, salt, iterations, bits) {
            return sjcl.misc.pbkdf2(password, salt, Number(iterations), bits || 256);
        },

        /**
         * The same bits through WebCrypto when there is one.
         * @return {Promise} resolves to an SJCL bit array
         */
        derive: function(password, salt, iterations, bits) {
            var crypto = subtle();
            bits = bits || 256;

            if (!crypto || !(typeof salt === 'string' || _.isArray(salt))) {
                return new Q(Kdf.deriveSync(password, salt, iterations, bits));
            }

            return new Q()
            .then(function() {
                return crypto.importKey('raw', toBytes(String(password)), 'PBKDF2', false, ['deriveBits']);
            })
            .then(function(key) {
                return crypto.deriveBits({
                    name       : 'PBKDF2',
                    hash       : 'SHA-256',
                    salt       : toBytes(salt),
                    iterations : Number(iterations)
                }, key, bits);
            })
            .then(function(buffer) {
                var hex = _.map(new Uint8Array(buffer), function(b) {
                    return (b < 16 ? '0' : '') + b.toString(16);
                }).join('');
                return sjcl.codec.hex.toBits(hex);
            })
            // Anything WebCrypto refuses (an empty password in some
            // engines, a page that is not a secure context)
            .fail(function() {
                return Kdf.deriveSync(password, salt, iterations, bits);
            });
        },

        /**
         * A verifier in the current form.
         */
        isVerifier: function(value) {
            return parse(value) !== null;
        },

        /**
         * A verifier in the form used until 0.8.0-rc2: SHA-256 of
         * the password as SJCL's eight 32-bit words.
         */
        isLegacy: function(value) {
            return _.isArray(value) && value.length === 8 && _.every(value, _.isNumber);
        },

        _compose: function(salt, bits) {
            return [PREFIX, ITERATIONS, salt, sjcl.codec.hex.fromBits(bits)].join('$');
        },

        /**
         * A new verifier for a password.
         * @return {Promise} resolves to the verifier string
         */
        hash: function(password) {
            var salt = randomSalt();

            return Kdf.derive(password, sjcl.codec.hex.toBits(salt), ITERATIONS, 256)
            .then(function(bits) {
                return Kdf._compose(salt, bits);
            });
        },

        hashSync: function(password) {
            var salt = randomSalt();
            return Kdf._compose(
                salt, Kdf.deriveSync(password, sjcl.codec.hex.toBits(salt), ITERATIONS, 256)
            );
        },

        _verifyLegacy: function(password, stored) {
            return same(
                sjcl.hash.sha256.hash(String(password)).toString(), stored.toString()
            );
        },

        /**
         * Is this the password the verifier was made from?
         * @return {Promise} resolves to a boolean
         */
        verify: function(password, stored) {
            var parts = parse(stored);

            if (!parts) {
                return new Q(Kdf.isLegacy(stored) && Kdf._verifyLegacy(password, stored));
            }

            return Kdf.derive(password, sjcl.codec.hex.toBits(parts.salt), parts.iter, 256)
            .then(function(bits) {
                return same(sjcl.codec.hex.fromBits(bits), parts.hash);
            });
        },

        verifySync: function(password, stored) {
            var parts = parse(stored);

            if (!parts) {
                return Kdf.isLegacy(stored) && Kdf._verifyLegacy(password, stored);
            }

            return same(
                sjcl.codec.hex.fromBits(
                    Kdf.deriveSync(password, sjcl.codec.hex.toBits(parts.salt), parts.iter, 256)
                ),
                parts.hash
            );
        }
    };

    return Kdf;
});
