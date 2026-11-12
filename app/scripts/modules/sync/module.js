/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'underscore',
    'q',
    'backbone.radio',
    'modules/sync/runner'
], function(_, Q, Radio, Runner) {
    'use strict';

    /**
     * Sync to a folder rsync can reach (a storage box over SSH, or a
     * local folder). Desktop only: the shell runs rsync. Loaded when
     * it is the chosen backend (moduleLoader.js).
     *
     * Runs when the app starts, a little after something was saved,
     * every ten minutes, and when asked. One run at a time; a request
     * during a run is answered by the run in progress.
     *
     * Channel `sync`
     *   request `start`   run now; resolves with the summary
     *   event   `start`   a run began
     *   event   `stop`    a run ended: {ok, summary | message, at}
     */
    var Sync = {

        running : null,
        last    : null,

        settings: function() {
            var configs = Radio.request('configs', 'get:object') || {};

            return {
                profile : Radio.request('uri', 'profile') || 'notes-db',
                remote  : String(configs.syncRemote || '').trim(),
                port    : String(configs.syncPort || '').trim()
            };
        },

        isReady: function() {
            return Runner.isAvailable() && Sync.settings().remote.length > 0;
        },

        start: function() {
            if (Sync.running) {
                return Sync.running;
            }
            if (!Sync.isReady()) {
                return new Q(null);
            }

            // Locked: the records could be read but a conflict copy
            // could not be made
            if (Radio.request('encrypt', 'check:auth') !== true) {
                return new Q(null);
            }

            var runner = new Runner(Sync.settings());

            Radio.trigger('sync', 'start');

            Sync.running = runner.run()
            .then(function(summary) {
                Sync.last = {ok: true, summary: summary, at: Date.now()};
                return summary;
            })
            .fail(function(e) {
                console.error('Sync:', e && e.message);
                Sync.last = {
                    ok      : false,
                    step    : e && e.step,
                    message : (e && e.message) || String(e),
                    at      : Date.now()
                };
                return null;
            })
            .fin(function() {
                Sync.running = null;
                Radio.trigger('sync', 'stop', Sync.last);
            });

            return Sync.running;
        },

        // A little after the last save, so a burst of typing is one run
        soon: _.debounce(function() {
            Sync.start();
        }, 20000)
    };

    Radio.reply('sync', {
        start  : Sync.start,
        status : function() {
            return Sync.last;
        }
    });

    Radio.request('init', 'add', 'module', function() {
        _.each(['notes', 'notebooks', 'tags'], function(store) {
            Radio.channel(store).on('sync:model destroy:model restore:model', Sync.soon);
        });

        Radio.once('global', 'app:start', function() {
            _.delay(Sync.start, 3000);
        });

        window.setInterval(Sync.start, 10 * 60 * 1000);
    });

    return Sync;
});
