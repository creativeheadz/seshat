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
    'backbone',
    'marionette'
], function(_, Backbone) {
    'use strict';

    /**
     * Child-view containers that count as they go.
     *
     * BabySitter recounts every view (`_.size`, so all keys) each
     * time one is added or removed. A list of n rows therefore costs
     * n * n / 2 key reads to build and the same again to tear down:
     * at 3,000 notes that was a third of start-up. Keeping a counter
     * makes both linear. Behaviour is otherwise the library's own.
     */
    var proto = Backbone.ChildViewContainer.prototype;

    proto.add = function(view, customIndex) {
        var viewCid = view.cid;

        if (!_.has(this._views, viewCid)) {
            this.length++;
        }

        // store the view
        this._views[viewCid] = view;

        // index it by model
        if (view.model) {
            this._indexByModel[view.model.cid] = viewCid;
        }

        // index by custom
        if (customIndex) {
            this._indexByCustom[customIndex] = viewCid;
        }

        return this;
    };

    proto.remove = function(view) {
        var viewCid = view.cid;

        // delete model index
        if (view.model) {
            delete this._indexByModel[view.model.cid];
        }

        // delete custom index
        _.any(this._indexByCustom, function(cid, key) {
            if (cid === viewCid) {
                delete this._indexByCustom[key];
                return true;
            }
        }, this);

        // remove the view from the container
        if (_.has(this._views, viewCid)) {
            delete this._views[viewCid];
            this.length--;
        }

        return this;
    };

    return proto;
});
