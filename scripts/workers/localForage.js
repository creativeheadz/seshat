/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";importScripts("../../vendor/requirejs/require.js"),requirejs.config({baseUrl:"../",paths:{q:"../vendor/q/q",underscore:"../vendor/underscore/underscore",localforage:"../vendor/localforage/dist/localforage"}}),requirejs(["helpers/db"],function(e){self.onmessage=function(s){var r=s.data;return e[r.msg]?e[r.msg](r.data).then(function(e){self.postMessage({msg:"done",promiseId:r.promiseId,data:e})}).fail(function(e){self.postMessage({msg:"fail",promiseId:r.promiseId,data:e})}):void console.error("localForage module:","Method doesn't exist",r.msg)},self.postMessage({msg:"ready"})});