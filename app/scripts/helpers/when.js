/**
 * Copyright (C) 2026 Seshat project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global define */
define([
    'jquery',
    'i18next'
], function($, i18n) {
    'use strict';

    /**
     * Dates as the list and the page show them.
     *
     * Everything goes through Intl with the interface language, so
     * "Today", month names and day-month order follow the locale
     * without a translation key per label.
     */
    var cache = {};

    function lang() {
        var lng = i18n.language || (window.navigator && window.navigator.language) || 'en';
        return String(lng).replace('_', '-');
    }

    function make(Ctor, options) {
        try {
            return new Ctor(lang(), options);
        } catch (e) {
            return new Ctor('en', options);
        }
    }

    function dateFormat(name, options) {
        var key = lang() + ':' + name;
        cache[key] = cache[key] || make(Intl.DateTimeFormat, options);
        return cache[key];
    }

    function capitalize(str) {
        return str.charAt(0).toLocaleUpperCase() + str.slice(1);
    }

    // "today", "yesterday", "last week"… in the interface language
    function relative(value, unit, fallback) {
        if (typeof Intl.RelativeTimeFormat === 'undefined') {
            return $.t(fallback);
        }

        var key = lang() + ':relative';
        cache[key] = cache[key] || make(Intl.RelativeTimeFormat, {numeric: 'auto'});
        return capitalize(cache[key].format(value, unit));
    }

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    var When = {

        /**
         * A date for a list row: the time today, day and month this
         * year, month and year before that.
         */
        short: function(timestamp) {
            var date = new Date(Number(timestamp) || 0),
                now  = new Date();

            if (startOfDay(date) === startOfDay(now)) {
                return dateFormat('time', {hour: 'numeric', minute: '2-digit'}).format(date);
            }
            if (date.getFullYear() === now.getFullYear()) {
                return dateFormat('day', {day: 'numeric', month: 'short'}).format(date);
            }
            return dateFormat('month', {month: 'short', year: 'numeric'}).format(date);
        },

        /**
         * A date written out, for the page.
         */
        long: function(timestamp) {
            return dateFormat('long', {day: 'numeric', month: 'long', year: 'numeric'})
            .format(new Date(Number(timestamp) || 0));
        },

        /**
         * Returns a function that files a timestamp under a heading:
         * today, yesterday, this week, last week, this month, then a
         * month per heading. "Now" is fixed when the grouper is made,
         * so one pass over a list is consistent.
         */
        grouper: function() {
            var now       = new Date(),
                today     = startOfDay(now),
                day       = 86400000,
                // Weeks start on Monday
                thisWeek  = today - ((now.getDay() + 6) % 7) * day,
                lastWeek  = thisWeek - 7 * day,
                thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

            return function(timestamp) {
                var date = new Date(Number(timestamp) || 0),
                    time = startOfDay(date);

                if (time >= today) {
                    return {key: 'day-0', label: relative(0, 'day', 'Today')};
                }
                if (time >= today - day) {
                    return {key: 'day-1', label: relative(-1, 'day', 'Yesterday')};
                }
                if (time >= thisWeek) {
                    return {key: 'week-0', label: relative(0, 'week', 'This week')};
                }
                if (time >= lastWeek) {
                    return {key: 'week-1', label: relative(-1, 'week', 'Last week')};
                }
                if (time >= thisMonth) {
                    return {key: 'month-0', label: relative(0, 'month', 'This month')};
                }

                var sameYear = date.getFullYear() === now.getFullYear();
                return {
                    key   : 'month-' + date.getFullYear() + '-' + date.getMonth(),
                    label : capitalize(
                        sameYear ?
                        dateFormat('monthName', {month: 'long'}).format(date) :
                        dateFormat('monthYear', {month: 'long', year: 'numeric'}).format(date)
                    )
                };
            };
        }
    };

    return When;
});
