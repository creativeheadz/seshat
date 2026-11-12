/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define, window */
define([
    'underscore',
    'marionette',
    'backbone.radio',
    'i18next',
    'modules/importExport/vault/runner',
    'modules/importExport/vault/tauriSource',
    'modules/importExport/vault/writer',
    'text!apps/settings/show/templates/importExport.html'
], function (_, Marionette, Radio, i18n, vaultRunner, vaultSource, vaultWriter, Tmpl) {
    'use strict';

    /**
     * Import or export settings
     */
    var ImportExport = Marionette.ItemView.extend({
        template: _.template(Tmpl),

        ui: {
            importBtn  : '#do-import',
            import     : '#import-file',

            // Export  / import buttons
            importData : '#import-data-file',
            exportData : '#export-data',

            vaultBtn      : '#do-import-vault',
            vaultProgress : '#import-vault-progress',
            vaultBar      : '#import-vault-progress .progress-bar',
        },

        events: {
            'click .btn--import'    : 'triggerClick',
            'change @ui.import'     : 'triggerImport',
            'change @ui.importData' : 'triggerImportData',
            'click @ui.exportData'  : 'triggerExportData',
            'click @ui.vaultBtn'    : 'triggerVaultImport'
        },

        triggers: {
            'click #do-export'  : 'export'
        },

        templateHelpers: function() {
            return {
                isTauri: typeof window !== 'undefined' &&
                    !!window.__TAURI__,
            };
        },

        triggerImport: function(e) {
            if (!e.target.files.length) {
                return;
            }
            this.trigger('import', e.target);
        },

        triggerImportData: function(e) {
            if (!e.target.files.length) {
                return;
            }

            Radio.request('importExport', 'import', e.target.files);
        },

        triggerExportData: function() {
            Radio.request('importExport', 'export');
        },

        triggerClick: function(e) {
            var file = $(e.currentTarget).attr('data-file');
            $(file).click();
        },

        triggerVaultImport: function() {
            var self    = this,
                profile = Radio.request('uri', 'profile') || 'notes-db';

            if (this.importing) {
                return;
            }
            this.importing = true;
            this.ui.vaultBtn.prop('disabled', true);
            this.ui.vaultProgress.removeClass('hidden');
            this.setVaultProgress(0, 1);

            vaultRunner.run(vaultSource.pick, vaultWriter.makeWriter(profile), {
                onProgress: function(state) {
                    self.setVaultProgress(state.done, state.total);
                },
            })
            .then(function(summary) {
                self.importing = false;
                self.ui.vaultBtn.prop('disabled', false);
                self.ui.vaultProgress.addClass('hidden');

                if (!summary || summary.cancelled) {
                    return;
                }
                self.reportVault(summary);
            })
            .fail(function(e) {
                self.importing = false;
                self.ui.vaultBtn.prop('disabled', false);
                self.ui.vaultProgress.addClass('hidden');
                console.error('vault import:', e);
                Radio.request('Confirm', 'start', {
                    title   : i18n.t('Import failed'),
                    content : String((e && e.message) || e),
                });
            });
        },

        setVaultProgress: function(done, total) {
            var pct = total ? Math.round(done / total * 100) : 0;
            this.ui.vaultBar.css('width', pct + '%');
            this.ui.vaultBar.text(done + ' / ' + total);
        },

        reportVault: function(summary) {
            var content = i18n.t('vault import summary')
                .split('{{notes}}').join(summary.notes)
                .split('{{notebooks}}').join(summary.notebooks)
                .split('{{skipped}}').join(summary.skipped);

            if (summary.unresolved) {
                content += '\n\n' + i18n.t('unresolved links')
                    .split('{{unresolved}}').join(summary.unresolved);
            }

            Radio.request('Confirm', 'start', {
                title     : i18n.t('Import complete'),
                content   : content,
                onConfirm : function() { document.location.reload(); },
                onCancel  : function() { document.location.reload(); },
            });
        }
    });

    return ImportExport;
});
