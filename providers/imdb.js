'use strict';

const debug = require('debug')('IMDb');
const _ = require('lodash');
const URI = require('urijs');
const URITemplate = require('urijs/src/URITemplate');
const puppeteer = require('puppeteer');

const trakttv = require('./trakttv.js');
const mdb = require('./themoviedb.js');

const log = require('../logger.js');

let status = true;
const URL = URI('http://akas.imdb.com');
const TITLE_URL = URITemplate(URL.toString() + 'title/{imdbId}/combined');
const SEASON_URL = URITemplate(URL.toString() + 'title/{imdbId}/episodes?season={season}');
const TRAILER_URL = URITemplate(URL.toString() + 'video/imdb/{trailerId}/imdb/embed?autoplay=true&format=720p');

class IMDb {
    static async fetch(imdbId, type) {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        try {
            let imdbInfo = fetchInfo(page, imdbId);
            let mdbInfo = mdb.fetch(imdbId, type);
            let trakttvInfo = trakttv.fetch(imdbId, type);

            [imdbInfo, mdbInfo, trakttvInfo] = [await imdbInfo, await mdbInfo, await trakttvInfo];

            if (!imdbInfo) return;

            imdbInfo.trailer = imdbInfo.trailer && TRAILER_URL
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

            if (!status) {
                status = true;
                debug('seems to be back');
            }

            await browser.close();
            return imdbInfo;
        } catch (err) {
            if (status) {
                status = false;
                log.error('[IMDb]', err);
            }

            await browser.close();
            return null;
        }
    }

    static resizeImage(imageUrl, size) {
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
    }

    static getURL() {
        return URL;
    }

    static getTitleURL() {
        return TITLE_URL;
    }

    static isOn() {
        return status;
    }
}

async function fetchInfo(page, imdbId) {
    var url = TITLE_URL
        .expand({ imdbId: imdbId })
        .toString();

    debug(url);

    await page.goto(url);

    const result = await page.evaluate(() => {
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
    });

    const imdbInfo = result.imdbInfo;

    if (result.successful) {
        // data validation
        if (!imdbInfo._id || !imdbInfo.title || !imdbInfo.year) {
            return;
        }

        if (imdbInfo.type == 'movie') {
            return imdbInfo;
        } else {
            return await fetchShowEpisodes(page, imdbInfo);
        }
    } else {
        throw result.error;
    }
}

async function fetchShowEpisodes(page, imdbInfo) {
    imdbInfo.episodes = {};

    return Promise.resolve(imdbInfo.seasons)
        .each(function(season) {
            var url = SEASON_URL
                .expand({ imdbId: imdbInfo._id, season: season })
                .toString();

            if (season > imdbInfo.numSeasons) {
                imdbInfo.numSeasons = season;
            }

            debug(url);

            return horseman
                .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
                .open(url)
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
                        return;
                    } else {
                        throw result.error;
                    }
                });
        })
        .then(function() {
            delete imdbInfo.seasons;
            return imdbInfo;
        });
}

module.exports = IMDb;