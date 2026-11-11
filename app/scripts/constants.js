/**
 * Copyright (C) 2015 Laverna project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/*global define*/
define(function () {
    'use strict';

    var constants = {};

    constants.VERSION = '0.8.0-rc1';
    constants.URL = location.origin + location.pathname.replace('index.html', '');

    return constants;
});
