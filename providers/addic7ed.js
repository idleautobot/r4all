'use strict';

var debug = require('debug')('Addic7ed');
var _ = require('lodash');
var URI = require('urijs');
var URITemplate = require('urijs/src/URITemplate');
var Horseman = require('node-horseman');
var Release = require('scene-release-parser');

var log = require('../logger.js');
var common = require('../common.js');

var Addic7ed = function() {
    this.URL = URI('http://www.addic7ed.com');
    this.SHOW_LIST_URL = this.URL.clone().segment('/shows.php');
    this.SHOW_EPISODE_URL = URITemplate(this.URL.toString() + '/re_episode.php?ep={addic7edId}-{season}x{episode}');
    this.SHOW_URL = URITemplate(this.URL.toString() + 'show/{addic7edId}?langs=|1|');

    // status
    this.isOn = true;
};
Addic7ed.prototype.constructor = Addic7ed;

Addic7ed.prototype.download = function(subtitleId) {
    var _this = this;

    return common.request(this.URL.toString() + subtitleId, { headers: { 'referer': this.URL.toString() } })
        .then(function(subtitle) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return subtitle;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[Addic7ed] ', err);
            }

            return null;
        });
};

Addic7ed.prototype.fetchShow = function(title, year) {
    // init
    var horseman = new Horseman({ timeout: 30 * 1000, cookiesFile: 'cookies.txt' });

    var url = this.SHOW_LIST_URL.toString();

    debug(url);

    var _this = this;

    return horseman
        .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
        .open(url)
        .evaluate(function(title, year) {
            var result = {
                successful: true,
                addic7edId: null
            };

            var regex = function(str, regex) {
                try {
                    var match = str.match(regex);
                    match.shift(); // remove original string that was parsed

                    if (match.length == 1)
                        return match[0];
                    else
                        return match;
                } catch (err) {
                    return null;
                }
            };

            try {
                // validate the page
                if (!$('#container').length) throw 'site validation failed (fetchShow)';

                var match = $('.version a').filter(function() {
                    return $(this).text().toUpperCase() == (title + ' (' + year + ')').toUpperCase();
                });

                if (!$(match).length) {
                    match = $('.version a').filter(function() {
                        return $(this).text().toUpperCase() == title.toUpperCase();
                    });
                }

                result.addic7edId = parseInt(regex($(match).attr('href'), /^\/show\/(\d+)$/i)) || null;
            } catch (err) {
                result.successful = false;
                result.error = err;
            }

            return result;
        }, title, year)
        .then(function(result) {
            if (result.successful) {
                return result.addic7edId;
            } else {
                throw result.error;
            }
        })
        .then(function(addic7edId) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            horseman.close();
            horseman = null;

            return addic7edId;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[Addic7ed] ', err);
            }

            horseman.close();
            horseman = null;

            return null;
        });
};

Addic7ed.prototype.fetchSubtitle = function(parsed, season, episode, addic7edId) {
    // init
    var horseman = new Horseman({ timeout: 30 * 1000, cookiesFile: 'cookies.txt' });

    var url = this.SHOW_EPISODE_URL
        .expand({ addic7edId: addic7edId, season: season, episode: episode })
        .toString();

    debug(url);

    var _this = this;

    return horseman
        .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
        .open(url)
        .evaluate(function(releaseGroup) {
            var result = {
                successful: true,
                subtitleId: null
            };

            var COMPATIBILITY = {
                DIMENSION: 'LOL|SYS',
                IMMERSE: 'XII|ASAP',
                AVS: 'SVA'
            };

            var regex = function(str, regex) {
                try {
                    var match = str.match(regex);
                    match.shift(); // remove original string that was parsed

                    if (match.length == 1)
                        return match[0];
                    else
                        return match;
                } catch (err) {
                    return null;
                }
            };

            try {
                // check if subtitle page already exists (redirects to homepage)
                if ($('#containernews').length) return result;

                // validate the page
                if (!$('#qsSeason').length) throw 'site validation failed (fetchSubtitle)';

                releaseGroup = releaseGroup.toUpperCase();
                var re = new RegExp(releaseGroup + (COMPATIBILITY[releaseGroup] ? '|' + COMPATIBILITY[releaseGroup] : ''), 'i');

                // each subtitle
                $('.tabel95 .tabel95').each(function() {
                    var version = $(this).find('.NewsTitle').text();
                    var compatibility = $(this).find('.newsDate').first().text();

                    // skip WEB-DL versions
                    if (!version.match(/WEB(-|.)DL/i)) {
                        $(this).find('.language').each(function() {
                            // filter by English substitles and consider only completed && skip hearing imparied
                            if ($(this).text().match(/English/i) && $(this).next().text().match(/Completed/i) && !$(this).parent().next().find('img[src="http://www.addic7ed.com/images/hi.jpg"]').length) {
                                if (version.match(re) || compatibility.match(re)) {
                                    result.subtitleId = $(this).parent().find('a[href^="/updated/"]').attr('href') || $(this).parent().find('a[href^="/original/"]').attr('href');
                                    return false;
                                }
                            }
                        });
                    }
                });
            } catch (err) {
                result.successful = false;
                result.error = err;
            }

            return result;
        }, parsed.group)
        .then(function(result) {
            if (result.successful) {
                return result.subtitleId;
            } else {
                throw result.error;
            }
        })
        .then(function(subtitleId) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            horseman.close();
            horseman = null;

            return subtitleId;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[Addic7ed] ', err);
            }

            horseman.close();
            horseman = null;

            return null;
        });
};

module.exports = new Addic7ed;