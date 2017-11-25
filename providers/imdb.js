'use strict';

var debug = require('debug')('IMDb');
var Promise = require('bluebird');
var _ = require('lodash');
var URI = require('urijs');
var URITemplate = require('urijs/src/URITemplate');
var Horseman = require('node-horseman');

// workaround for 'Error: Failed to GET url:' issue
Horseman.registerAction('_open', function(url) {
    var _this = this;

    var openURL = function(url) {
        return _this
            .open(url)
            .catch(function(err) {
                if (err.message.indexOf('Error: Failed to GET url:') != -1) {
                    return openURL(url);
                } else {
                    throw err;
                }
            });
    };

    return openURL(url);
});

var trakttv = require('./trakttv.js');
var mdb = require('./themoviedb.js');

var log = require('../logger.js');

var IMDb = function() {
    this.URL = URI('http://akas.imdb.com');
    this.TITLE_URL = URITemplate(this.URL.toString() + 'title/{imdbId}/combined');
    this.SEASON_URL = URITemplate(this.URL.toString() + 'title/{imdbId}/episodes?season={season}');
    this.TRAILER_URL = URITemplate(this.URL.toString() + 'video/imdb/{trailerId}/imdb/embed?autoplay=true&format=720p');

    // status
    this.isOn = true;
};
IMDb.prototype.constructor = IMDb;

var fetchInfo = function(horseman, imdbId) {
    var url = this.TITLE_URL
        .expand({ imdbId: imdbId })
        .toString();

    debug(url);

    var _this = this;

    return horseman
        .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
        ._open(url)
        .evaluate(function() {
            var result = {
                successful: true,
                imdbInfo: {}
            };
            var info = result.imdbInfo;

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

            var getAKAs = function() {
                var akas = [];

                $('.info h5:contains("Also Known As:")').next('.info-content').contents().each(function(i, el) {
                    if (el.nodeType == 3) { // TextNode
                        var aka = regex($(this).text().trim(), /^"\s*(.+?)\s*"/);

                        if (aka) {
                            akas.push(aka);
                        }
                    }
                });

                return akas;
            };

            var getSeasons = function() {
                var seasons = [];

                $('.info h5:contains("Seasons:")').next('.info-content').find('a').each(function() {
                    var season = parseInt($(this).text());

                    if (season) {
                        seasons.push(season);
                    }
                });

                return seasons;
            };

            var getPlot = function() {
                var plot = '';

                $('.info h5:contains("Plot:")').next('.info-content').contents().each(function() {
                    var chunk = $(this).text();

                    if (['Full summary', 'Full synopsis', 'Add synopsis', 'See more'].indexOf(chunk) != -1 || chunk.indexOf('»') != -1) {
                        return false;
                    }

                    plot += chunk;
                });

                return plot.split('|')[0].trim();
            };

            var getGenres = function() {
                var genres = [];

                $('.info h5:contains("Genre:")').next('.info-content').find('a[href^="/Sections/Genres/"]').each(function() {
                    genres.push($(this).text());
                });

                return genres;
            };

            try {
                // validate the page
                if (!$('#tn15').length) throw 'site validation failed (fetchInfo)';

                info._id = regex($('link[href$="combined"]').attr('href'), /imdb\.com\/title\/(tt\d+)/i);
                info.title = regex($('title').text(), /^\s*(.+?)\s*\(.*?\d{4}.*?\)$/);
                info.akas = getAKAs();

                if ($('.info h5:contains("Seasons:")').length) {
                    info.title = info.title.replace(/^\"|\"$/g, '');
                    info.type = 'show';
                    info.seasons = getSeasons();
                    info.numSeasons = 1;
                } else {
                    info.type = 'movie';
                }

                info.year = parseInt(regex($('title').text(), /\(.*?(\d{4}).*?\)$/));
                info.plot = getPlot();
                info.genres = getGenres();
                info.runtime = parseInt(regex($('.info h5:contains("Runtime:")').next('.info-content').text(), /^.*?(\d+)/)) || null;
                info.rating = parseFloat($('#tn15rating .general .starbar-meta b').text().split('/10')[0]) || null;
                info.votes = parseInt($('#tn15rating .general .starbar-meta a').text().split(' ')[0].replace(/,/g, '')) || null;

                var cover = $('#primary-poster').attr('src');
                if (cover && cover.indexOf('media-imdb.com') != -1) {
                    info.cover = cover.replace(/_V1.*?\.jpg/i, '_V1._SY0.jpg');
                }

                info.trailer = $('#title-media-strip').find('a[href^="/video/"]').first().attr('data-video');
            } catch (err) {
                result.successful = false;
                result.error = err;
            }

            return result;
        })
        .then(function(result) {
            var imdbInfo = result.imdbInfo;

            if (result.successful) {
                // data validation
                if (!imdbInfo._id || !imdbInfo.title || !imdbInfo.year) {
                    return;
                }

                if (imdbInfo.type == 'movie') {
                    return imdbInfo;
                } else {
                    imdbInfo.episodes = {};

                    return _.bind(fetchShowEpisodes, _this)(horseman, imdbInfo)
                        .then(function() {
                            delete imdbInfo.seasons;
                            return imdbInfo;
                        });
                }
            } else {
                throw result.error;
            }
        });
};

var fetchShowEpisodes = function(horseman, imdbInfo, index) {
    index = index || 0;

    var season = imdbInfo.seasons[index];

    if (season == null) return;

    var url = this.SEASON_URL
        .expand({ imdbId: imdbInfo._id, season: season })
        .toString();

    if (season > imdbInfo.numSeasons) {
        imdbInfo.numSeasons = season;
    }

    debug(url);

    var _this = this;

    return horseman
        .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
        ._open(url)
        .injectJs('node_modules/moment/min/moment.min.js')
        .evaluate(function(expectedSeason) {
            var result = {
                successful: true,
                episodes: {}
            };
            var episodes = result.episodes;

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
                if (!$('#episodes_content').length) throw 'site validation failed (fetchEpisodes)';
                if ($('#episode_top').text().replace(/[^\d]/g, '') != expectedSeason) throw 'site validation failed (' + $('#episode_top').text() + ')';

                $('.list_item').each(function() {
                    var parsed = regex($(this).find('.image').text().trim(), /S(\d{1,3}), Ep(\d{1,3})/i);

                    if (parsed) {
                        var season = parseInt(parsed[0]);
                        var episode = parseInt(parsed[1]);
                        var aired = $(this).find('.airdate').text().trim();

                        if (expectedSeason != season) throw 'unexpected season, expecting \'' + expectedSeason + '\' and got \'' + season + '\'';

                        var ep = episodes[episode] = {};

                        ep.title = $(this).find('[itemprop="name"]').text().trim();
                        ep.aired = moment(aired, 'D MMM. YYYY').isValid() && moment(aired, 'D MMM. YYYY').toDate();
                        ep.description = $(this).find('.item_description').text().trim();
                    }
                });
            } catch (err) {
                result.successful = false;
                result.error = err;
            }

            return result;
        }, season)
        .then(function(result) {
            if (result.successful) {
                imdbInfo.episodes[season] = result.episodes;
                return _.bind(fetchShowEpisodes, _this)(horseman, imdbInfo, ++index);
            } else {
                throw result.error;
            }
        });
};

IMDb.prototype.resizeImage = function(imageUrl, size) {
    var toSize;

    switch (size) {
        case 'thumb':
            toSize = '_V1._SX300.jpg';
            break;
        case 'medium':
            toSize = '_V1._SX600.jpg';
            break;
        default:
            toSize = '_V1._SY0.jpg';
    }

    return imageUrl.replace(/_V1.*?\.jpg/i, toSize);
};

IMDb.prototype.fetchInfo = function(imdbId, type) {
    // init
    var horseman = new Horseman({ timeout: 30 * 1000, cookiesFile: 'cookies.txt' });

    var _this = this;

    return Promise.join(_.bind(fetchInfo, this)(horseman, imdbId), mdb.fetch(imdbId, type), trakttv.fetch(imdbId, type), function(imdbInfo, mdbInfo, trakttvInfo) {
            if (!imdbInfo) return;

            imdbInfo.trailer = _this.TRAILER_URL
                .expand({ trailerId: imdbInfo.trailer })
                .toString();

            // mdbInfo
            if (mdbInfo) {
                imdbInfo.cover = mdbInfo.cover || imdbInfo.cover;
                imdbInfo.backdrop = mdbInfo.backdrop;
            }

            // trakttvInfo
            if (trakttvInfo) {
                imdbInfo.trailer = trakttvInfo.trailer || imdbInfo.trailer;

                if (trakttvInfo.state) {
                    imdbInfo.state = trakttvInfo.state;
                }
            }

            return imdbInfo;
        })
        .then(function(imdbInfo) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            horseman.close();
            horseman = null;

            return imdbInfo;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[IMDb] ', err);
            }

            horseman.close();
            horseman = null;

            return null;
        });
};

module.exports = new IMDb;