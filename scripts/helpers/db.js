/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
define(["underscore","q","localforage"],function(t,e,n){"use strict";var o={dbs:{},getDb:function(t){var e=t.profile+"/"+t.storeName;return this.dbs[e]=this.dbs[e]||n.createInstance({name:t.profile||"notes-db",storeName:t.storeName}),this.dbs[e]},find:function(t){var n=e.defer();return this.getDb(t.options).getItem(t.id,function(t,e){return t?n.reject(t):(e||n.reject("not found"),n.resolve(e))}),n.promise},findAll:function(n){var o=e.defer(),i=n.options.conditions,r=[];return this.getDb(n.options).iterate(function(e){!e||i&&!t.isMatch(e,i)||r.push(e)},function(t){return t?o.reject(t):void o.resolve(r)}),o.promise},findByKeys:function(n,o){var i=[],r=this,s=[];return t.each(n,function(e){i.push(r.find({id:e,options:o.options}).then(function(e){if(e&&(!o.options.conditions||t.isMatch(e,o.options.conditions)))return s.push(e),e}))}),e.all(i).then(function(){return s})},save:function(n){var o=e.defer(),i=n.data;return i.encryptedData&&(i=t.omit(i,n.options.encryptKeys)),this.getDb(n.options).setItem(n.id,i,function(t,e){return t?o.reject(t):o.resolve(e)}),o.promise}};return o});