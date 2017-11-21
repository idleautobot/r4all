'use strict';

var debug = require('debug')('RARBG');
var Promise = require('bluebird');
var _ = require('lodash');
var URI = require('urijs');
var Horseman = require('node-horseman');

var log = require('../logger.js');

var RARBG = function() {
    this.URL = URI('https://rarbg.to');

    // status
    this.isOn = true;

    this.lastPage = null;
    this.lastRelease = null;
    this.newReleases = null;
};
RARBG.prototype.constructor = RARBG;

var getReleasesFromPage = function(horseman) {
    var _this = this;

    return horseman
        .injectJs('node_modules/moment/min/moment.min.js')
        .injectJs('node_modules/moment-timezone/builds/moment-timezone-with-data.min.js')
        .evaluate(function(lastRelease) {
            var page = parseInt($('#pager_links').find('b').text());
            var result = {
                successful: true,
                releases: [],
                done: false
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
                // loop through every row
                $('.lista2t .lista2').each(function() {
                    var column1 = $(this).find('.lista').eq(0);
                    var column2 = $(this).find('.lista').eq(1);
                    var column3 = $(this).find('.lista').eq(2);

                    var release = {
                        _id: null,
                        name: $(column2).find('a[href^="/torrent/"]').text().trim().replace(/\[.+\]$/, ''),
                        category: parseInt(regex($(column1).find('a[href^="/torrents.php?category="]').attr('href'), /\/torrents\.php\?category=(\d+)/i)),
                        pubdate: $(column3).text().trim(),
                        imdbId: regex($(column2).find('a[href^="/torrents.php?imdb="]').attr('href'), /\/torrents\.php\?imdb=(tt\d+)/i),
                        type: null,
                        quality: null,
                        page: page
                    };

                    // validation
                    if (release.name && [41, 44, 45].indexOf(release.category) != -1 && moment(release.pubdate, 'YYYY-MM-DD HH:mm:ss').isValid()) {
                        var pubdate = moment.tz(release.pubdate, 'YYYY-MM-DD HH:mm:ss', 'Europe/Berlin').tz('Europe/Lisbon');

                        // define stop point
                        if (lastRelease && pubdate.isSameOrBefore(lastRelease.pubdate)) {
                            if (release.name == lastRelease.name || pubdate.isBefore(lastRelease.pubdate)) {
                                result.debug = 'site scraping done at ' + pubdate.format('YYYY-MM-DD HH:mm:ss');
                                result.done = true;
                                return false;
                            }
                        }

                        release._id = release.name.replace(/[^\w_]/g, '').toUpperCase();
                        release.pubdate = pubdate.format();
                        release.type = (release.category == 41 ? 'show' : 'movie');
                        release.quality = (release.name.indexOf('1080p') != -1 ? '1080p' : '720p');

                        result.releases.push(release);
                    } else {
                        throw 'site scraping: ' + release.category + '|' + release.name + '|' + release.pubdate;
                    }
                });

                // check if reached last page
                if (!result.done && !$('#pager_links').find('a[title="next page"]').length) {
                    result.debug = 'site scraping reached the last page: ' + page;
                    result.done = true;
                }
            } catch (err) {
                result.successful = false;
                result.error = err;
            }

            return result;
        }, this.lastRelease)
        .then(function(result) {
            if (result.successful) {
                if (result.debug) {
                    debug(result.debug);
                }

                _.forEach(result.releases, function(release) {
                    _this.newReleases[release._id] = release;
                });

                return result.done;
            } else {
                throw result.error;
            }
        });
};

var solveCaptcha = function(horseman) {
    return horseman
        .injectJs('providers/gocr.js')
        .evaluate(function() {
            var img = $('img[src^="/captcha2/"]')[0];

            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

            var d = pixels.data;

            for (var i = 0; i < d.length; i += 4) {
                var r = d[i];
                var g = d[i + 1];
                var b = d[i + 2];
                var v = 0;

                //Extract only gray pixels
                //Filter darker pixels (<100)
                var diff = Math.abs(r - g) + Math.abs(r - b) + Math.abs(g - b);
                var isGray = diff <= 30 && r > 100;

                var color = isGray ? 255 : 0;
                d[i] = d[i + 1] = d[i + 2] = color;
            }

            ctx.putImageData(pixels, 0, 0);

            //GOCR is a library for OCR
            //In this simple captchas it is enough
            var captcha = GOCR(canvas);
            captcha = captcha.replace(/[\W_]/g, '');

            $('#solve_string').val(captcha);
            $('form').submit();
        })
        .waitForNextPage();
};

var verifyBrowser = function(horseman) {
    return horseman
        .click('a[href="/threat_defence.php?defence=1"]')
        .waitForNextPage();
};

var unknownPage = function(horseman) {
    return horseman
        .html()
        .then(function(body) {
            var fs = require('fs');

            var now = new Date();
            var fileName = 'rarbg/unknownpage_' + now.toISOString().slice(0, 19).replace(/:/g, '') + '.html';

            fs.writeFileSync(fileName, body);

            return;
        });
};

var pageLoadedHandler = function(horseman, page, attempt) {
    attempt = attempt || 0;

    if (attempt > 1) return _.bind(loadPage, this)(horseman, page);

    var _this = this;

    return horseman
        .evaluate(function() {
            var pageLoaded;

            if ($('.lista2t').length) {
                pageLoaded = 'torrents';
            } else if ($('#solve_string').length) {
                pageLoaded = 'captcha';
            } else if ($('a[href="/threat_defence.php?defence=1"]').href) {
                pageLoaded = 'verify';
            } else if ($('.content-rounded').length) {
                pageLoaded = 'verifying';
            } else if ($('body:contains("We have too many requests from your ip in the past 24h.")').length) {
                pageLoaded = 'banned';
            } else {
                pageLoaded = 'unknown';
            }

            return pageLoaded;
        })
        .then(function(pageLoaded) {
            switch (pageLoaded) {
                case 'torrents':
                    return _.bind(getReleasesFromPage, _this)(horseman)
                        .then(function(done) {
                            return done || Promise.delay(((Math.random() * 30) + 30) * 1000).then(function() {
                                return _.bind(loadPage, _this)(horseman, ++page);
                            });
                        });
                    break;
                case 'captcha':
                    debug('solving captcha...');

                    return solveCaptcha(horseman).then(function() {
                        return _.bind(loadPage, _this)(horseman, page);
                    });
                    break;
                case 'verify':
                    debug('triggering verify the browser...');

                    return verifyBrowser(horseman).then(function() {
                        return _.bind(loadPage, _this)(horseman, page);
                    });
                    break;
                case 'verifying':
                    debug('verifying the browser...');

                    return Promise.delay(5 * 1000).then(function() {
                        return _.bind(pageLoadedHandler, _this)(horseman, page, ++attempt);
                    });
                    break;
                case 'banned':
                    debug('banned...');

                    throw ('banned');
                default:
                    debug('unknown page loaded');

                    return unknownPage(horseman).throw('unknown page');
            }
        });
};

var loadPage = function(horseman, page) {
    var page = page || this.lastPage || 1;

    var url = this.URL.clone()
        .segment('torrents.php')
        .addQuery({ category: '41;44;45', page: page })
        .toString();

    var _this = this;

    debug(url);

    return horseman
        .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
        .open(url)
        .then(function() {
            return _.bind(pageLoadedHandler, _this)(horseman, page);
        });
};

RARBG.prototype.fetchReleases = function() {
    // init
    this.newReleases = {};
    var horseman = new Horseman({ cookiesFile: 'cookies.txt' });

    var _this = this;

    return _.bind(loadPage, this)(horseman)
        .then(function() {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            horseman.close();
            horseman = null;

            return true;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[RARBG] ', err);
            }

            horseman.close();
            horseman = null;

            return false;
        });
};

module.exports = new RARBG;