'use strict';

const debug = require('debug')('IMDb');
const _ = require('lodash');
const URI = require('urijs');
const URITemplate = require('urijs/src/URITemplate');
const puppeteer = require('puppeteer');

const trakttv = require('./trakttv.js');
const mdb = require('./themoviedb.js');

const log = require('../logger.js');

const URL = URI('https://www.imdb.com');
const TITLE_URL = URITemplate(URL.toString() + 'title/{imdbId}/');
const SEASON_URL = URITemplate(URL.toString() + 'title/{imdbId}/episodes?season={season}');
const AKAS_URL = URITemplate(URL.toString() + 'title/{imdbId}/releaseinfo');
const TRAILER_URL = URITemplate(URL.toString() + 'video/imdb/{trailerId}/imdb/embed?autoplay=true&format=720p');

let status = true;

const IMDb = {
    fetch: async function(imdbId, type) {
        let browser = null;

        try {
            browser = await puppeteer.launch({
                args: ['--lang=en', '--no-sandbox', '--disable-dev-shm-usage'],
                userDataDir: 'chromium-profile'
            });
            const page = await browser.newPage();

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

            await browser.close();

            if (!status) {
                status = true;
                debug('seems to be back');
            }

            return imdbInfo;
        } catch (err) {
            if (browser) await browser.close();

            status = false;
            log.crit('[IMDb] ' + (err.stack || err));

            return null;
        }
    },
    resizeImage: function(imageUrl, size) {
        let toSize;

        switch (size) {
            case 'thumb':
                toSize = '_V1._SX300.jpg';
                break;
            case 'medium':
                toSize = '_V1._SX600.jpg';
                break;
            default:
                toSize = '_V1._SY0.jpg';
                break;
        }

        return imageUrl.replace(/_V1.*?\.jpg/i, toSize);
    },
    getURL: function() {
        return URL;
    },
    getTitleURL: function() {
        return TITLE_URL;
    },
    isOn: function() {
        return status;
    }
}

async function fetchInfo(page, imdbId) {
    const url = TITLE_URL
        .expand({ imdbId: imdbId })
        .toString();

    debug(url);

    await page.goto(url);

    const result = await page.evaluate(() => {
        const result = {
            successful: true,
            imdbInfo: {}
        };
        const info = result.imdbInfo;

        function regex(str, regex) {
            try {
                const match = str.match(regex);
                match.shift(); // remove original string that was parsed

                if (match.length == 1)
                    return match[0];
                else
                    return match;
            } catch (err) {
                return null;
            }
        }

        function getRuntime(str) {
            const parsed = str.match(/(?:(\d+)h\s?)?(?:(\d+)min)?/);
            return parsed && (parseInt(parsed[1] || 0) * 60 + parseInt(parsed[2] || 0));
        }

        try {
            // validate the page
            if (!$('#title-overview-widget').length) throw new Error('site validation failed (fetchInfo)');

            info._id = regex($('link[href^="https://www.imdb.com/title/"]').attr('href'), /https:\/\/www\.imdb\.com\/title\/(tt\d+)/i);
            info.title = $('#title-overview-widget .title_wrapper h1').contents().filter(function() { return this.nodeType == 3; }).text().trim();

            if ($('#title-episode-widget').length) {
                info.type = 'show';
                info.year = Math.min.apply(Math, $('#title-episode-widget a[href^="/title/' + info._id + '/episodes?year="]').map(function() { return parseInt($(this).text()) || null; }).get());
                const seasons = $('#title-episode-widget a[href^="/title/' + info._id + '/episodes?season="]').map(function() { return parseInt($(this).text()) || null; }).get();
                info.numSeasons = Math.max.apply(Math, seasons);
            } else {
                info.type = 'movie';
                info.year = parseInt($('#titleYear > a').text());
            }

            info.rating = parseFloat($('#title-overview-widget [itemprop="ratingValue"]').text());
            info.votes = parseFloat($('#title-overview-widget [itemprop="ratingCount"]').text().replace(/,/g, ''));
            info.runtime = getRuntime($('#title-overview-widget time').text().trim());
            info.genres = $('#title-overview-widget a[href^="/genre/"]').map(function() { return $(this).text(); }).get();
            info.plot = $('#title-overview-widget .summary_text').text().trim();

            const cover = $('#title-overview-widget .poster img').attr('src');
            if (cover && cover.indexOf('media-amazon.com') !== -1) {
                info.cover = cover.replace(/_V1.*?\.jpg/i, '_V1._SY0.jpg');
            }

            info.trailer = $('#title-overview-widget a[href^="/video/imdb/"]').attr('data-video');
        } catch (err) {
            result.successful = false;
            result.error = err.stack;
        }

        return result;
    });

    const imdbInfo = result.imdbInfo;

    if (result.successful) {
        // data validation
        if (!imdbInfo._id || !imdbInfo.title || !imdbInfo.year) {
            return null;
        }

        if (imdbInfo.type == 'movie') {
            imdbInfo.akas = await fetchAKAs(page, imdbInfo._id);
        } else {
            imdbInfo.episodes = await trakttv.fetchEpisodes(imdbInfo._id);

            if (imdbInfo.episodes == null) return null;
        }
    } else {
        throw new Error(result.error);
    }

    return imdbInfo;
}

async function fetchAKAs(page, imdbId) {
    const url = AKAS_URL
        .expand({ imdbId: imdbId })
        .toString();

    debug(url);

    await page.goto(url);

    const result = await page.evaluate(() => {
        const result = {
            successful: true,
            akas: []
        };
        const akas = result.akas;

        try {
            // validate the page
            if (!$('#akas').length) throw 'site validation failed (fetchAKAs)';

            $('#akas tbody tr').each(function() {
                akas.push($(this).find('td').eq(1).text().trim());
            });
        } catch (err) {
            result.successful = false;
            result.error = err.stack;
        }

        return result;
    });

    if (!result.successful) throw result.error;

    return result.akas;
}

module.exports = IMDb;