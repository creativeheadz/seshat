/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
"use strict";importScripts("../../../../vendor/requirejs/require.js"),requirejs.config({baseUrl:"../../../",packages:[{name:"prism",location:"../vendor/prism",main:"bundle"}],paths:{q:"../vendor/q/q",underscore:"../vendor/underscore/underscore","markdown-it":"../vendor/markdown-it/dist/browser/markdown-it.umd.min","markdown-it-hash":"../vendor/markdown-it-hashtag/dist/markdown-it-hashtag.min","markdown-it-math":"../vendor/markdown-it-math/dist/markdown-it-math.min","markdown-it-imsize":"../vendor/markdown-it-imsize/dist/markdown-it-imsize.min"},shim:{"prism/bundle":{exports:"Prism"}}}),self.addEventListener=void 0,requirejs(["modules/markdown/libs/markdown-it"],function(e){var s=new e;self.onmessage=function(e){var r=e.data;return s[r.msg]?s[r.msg](r.data).then(function(e){self.postMessage({msg:"done",promiseId:r.promiseId,data:e})}).fail(function(e){self.postMessage({msg:"fail",promiseId:r.promiseId,data:e})}):void console.error("MarkdownIt module:","Method doesn't exist",r.msg)},self.postMessage({msg:"ready"})});