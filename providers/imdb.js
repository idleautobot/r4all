'use strict';

const debug = require('debug')('IMDb');
const _ = require('lodash');
const URI = require('urijs');
const URITemplate = require('urijs/src/URITemplate');
const puppeteer = require('puppeteer-core');

const trakttv = require('./trakttv.js');
const mdb = require('./themoviedb.js');

const log = require('../logger.js');
const settings = require('../settings.js');

const URL = URI('https://www.imdb.com');
const TITLE_URL = URITemplate(URL.toString() + 'title/{imdbId}/');
const AKAS_URL = URITemplate(URL.toString() + 'title/{imdbId}/releaseinfo');
const TRAILER_URL = URITemplate(URL.toString() + 'video/imdb/{trailerId}/imdb/embed?autoplay=true&format=720p');

let status = true;

const IMDb = {
    fetch: async function(imdbId, type) {
        return new Promise(async function(resolve, reject) {
            await fetch(resolve, imdbId, type);
        });
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
    getTitleURL: function(imdbId) {
        return TITLE_URL
            .expand({ imdbId: imdbId });
    },
    isOn: function() {
        return status;
    }
}

async function fetch(resolve, imdbId, type) {
    let browser = null;

    try {
        browser = await puppeteer.launch({
            executablePath: settings.chromiumPath,
            args: ['--lang=en'],
            userDataDir: 'r4all-profile'
        });

        const page = await browser.newPage();

        await page.setRequestInterception(true);

        page.on('request', request => {
            if (request.resourceType() === 'image')
                request.abort();
            else
                request.continue();
        });

        page.on('error', async function(err) {
            debug('PageOnError: ' + err.message);

            setTimeout(async function() {
                try { await browser.close(); } catch (err) {}
                resolve(null);
            }, 5000);
        });

        let imdbInfo = fetchInfo(page, imdbId);
        let mdbInfo = mdb.fetch(imdbId, type);
        let trakttvInfo = trakttv.fetch(imdbId, type);

        [imdbInfo, mdbInfo, trakttvInfo] = [await imdbInfo, await mdbInfo, await trakttvInfo];

        if (!imdbInfo) {
            try { await browser.close(); } catch (err) {}
            resolve(null);
            return;
        }

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

        resolve(imdbInfo);
    } catch (err) {
        try { await browser.close(); } catch (err) {}

        status = false;
        log.crit('[IMDb] ' + (err.stack || err));

        resolve(null);
    }
}

async function fetchInfo(page, imdbId) {
    const url = TITLE_URL
        .expand({ imdbId: imdbId })
        .toString();

    debug(url);

    await page.goto(url);

    const hasjQuery = await page.evaluate(() => {
        return (typeof window.$ === 'function');
    });

    if (!hasjQuery) {
        await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });
    }

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
            info.isMainTitle = !$('.titleParent').length;

            if (info.isMainTitle) {
                if ($('.np_episode_guide').length) {
                    info.type = 'show';
                    info.year = parseInt(regex($('#title-overview-widget .title_wrapper a[href^="/title/' + info._id + '/releaseinfo"]').text().trim(), /.*?(\d{4})/));
                    const seasons = $('#title-episode-widget a[href^="/title/' + info._id + '/episodes?season="]').map(function() { return parseInt($(this).text()) || null; }).get();
                    info.numSeasons = (seasons.length ? Math.max.apply(Math, seasons) : null);
                } else {
                    info.type = 'movie';
                    info.year = parseInt($('#titleYear > a').text());
                }

                info.rating = parseFloat($('#title-overview-widget [itemprop="ratingValue"]').text()) || null;
                info.votes = parseFloat($('#title-overview-widget [itemprop="ratingCount"]').text().replace(/,/g, '')) || null;
                info.runtime = getRuntime($('#title-overview-widget time').text().trim()) || null;
                info.genres = $('#title-overview-widget a[href^="/search/title?genres"]').map(function() { return $(this).text().trim(); }).get();
                info.plot = $('#title-overview-widget .summary_text').contents().filter(function() { return this.nodeType == 3 && $(this).text().trim() != '»'; }).text().trim();

                const cover = $('#title-overview-widget .poster img').attr('src');
                if (cover && cover.indexOf('media-amazon.com') !== -1) {
                    info.cover = cover.replace(/_V1.*?\.jpg/i, '_V1._SY0.jpg');
                }

                info.trailer = $('#title-overview-widget a[href^="/video/imdb/"]').attr('data-video') || null;
            } else {
                info.titleParentId = regex($('.titleParent a[href^="/title/').attr('href'), /\/title\/(tt\d+)/i);
            }
        } catch (err) {
            result.successful = false;
            result.error = err.stack;
        }

        return result;
    });

    const imdbInfo = result.imdbInfo;

    if (result.successful) {
        if (imdbInfo.isMainTitle) {
            delete imdbInfo.isMainTitle;

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
            return await fetchInfo(page, imdbInfo.titleParentId);
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

    const hasjQuery = await page.evaluate(() => {
        return (typeof window.$ === 'function');
    });

    if (!hasjQuery) {
        await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });
    }

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

    if (!result.successful) throw new Error(result.error);

    return result.akas;
}

module.exports = IMDb;