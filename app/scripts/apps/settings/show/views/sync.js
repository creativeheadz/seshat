/**
 * Copyright (C) 2015 Laverna project Authors.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'underscore',
    'jquery',
    'marionette',
    'backbone.radio',
    'helpers/when',
    'apps/settings/show/formBehavior',
    'text!apps/settings/show/templates/sync.html'
], function(_, $, Marionette, Radio, When, FormBehavior, Tmpl) {
    'use strict';

    /**
     * Sync settings.
     *
     * The rsync backend only exists in the desktop app, where the
     * shell can run rsync. A change takes effect once it is saved
     * (saving restarts the app), so "Sync now" is for the address
     * that is already in use.
     */
    var View = Marionette.ItemView.extend({
        template: _.template(Tmpl),

        behaviors: {
            FormBehavior: {
                behaviorClass: FormBehavior
            }
        },

        ui: {
            backend : '#cloudStorage',
            rsync   : '#sync--rsync',
            now     : '#sync--now',
            status  : '#sync--status'
        },

        events: {
            'change @ui.backend' : 'toggleRsync',
            'click @ui.now'      : 'syncNow'
        },

        initialize: function() {
            this.listenTo(Radio.channel('sync'), 'start', this.onSyncStart);
            this.listenTo(Radio.channel('sync'), 'stop', this.showStatus);
        },

        onRender: function() {
            if (this.isActive()) {
                this.showStatus(Radio.request('sync', 'status'));
            }
        },

        isDesktop: function() {
            return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
        },

        // Saved, loaded and pointed somewhere
        isActive: function() {
            var configs = this.collection.getConfigs();
            return this.isDesktop() && configs.cloudStorage === 'rsync' &&
                String(configs.syncRemote || '').trim().length > 0;
        },

        toggleRsync: function() {
            this.ui.rsync.toggleClass('hidden', this.ui.backend.val() !== 'rsync');
        },

        syncNow: function() {
            Radio.request('sync', 'start');
            return false;
        },

        onSyncStart: function() {
            this.ui.now.prop('disabled', true).find('i').addClass('animate-spin');
        },

        showStatus: function(last) {
            if (!this.ui.status.length || !_.isObject(this.ui.status)) {
                return;
            }

            this.ui.now.prop('disabled', !this.isActive()).find('i').removeClass('animate-spin');

            if (!last) {
                return this.ui.status.text('');
            }

            var when = When.short(last.at);

            this.ui.status
            .toggleClass('text-danger', !last.ok)
            .text(last.ok ?
                when + ': ' + $.t('sync.summary', last.summary) :
                when + ': ' + $.t('sync.failed', {
                    step    : last.step || '',
                    message : last.message || ''
                })
            );
        },

        serializeData: function() {
            return {
                models    : this.collection.getConfigs(),
                isDesktop : this.isDesktop(),
                isActive  : this.isActive()
            };
        }
    });

    return View;
});
