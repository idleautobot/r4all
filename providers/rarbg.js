'use strict';

const debug = require('debug')('RARBG');
const _ = require('lodash');
const URI = require('urijs');
const puppeteer = require('puppeteer');

const log = require('../logger.js');

const URL = URI('https://rarbg.to');
const PROXY_LIST_URL = URI('http://www.freeproxylists.com/https.html');

let status = true;
let pageNumber = 1;
let proxies = [];
let proxy = null;

const RARBG = {
    fetchReleases: async function(lastRelease, lastPage, isNewFetch = true) {
        // init
        if (isNewFetch) {
            this.newReleases = {};
            pageNumber = lastPage || 1;
        }

        let browser = null;

        try {
            if (_.isEmpty(proxies)) await getProxies();

            proxy = proxy || proxies.shift();

            browser = await puppeteer.launch({
                args: ['--lang=en', '--no-sandbox', '--proxy-server=' + proxy]
            });
            const page = await browser.newPage();
            await _.bind(loadPage, this)(page, lastRelease);

            if (!status) {
                status = true;
                debug('seems to be back');
            }

            await browser.close();
            return true;
        } catch (err) {
            if (status) {
                status = false;
                log.warn('[RARBG] ' + err.stack);
            }

            if (browser) await browser.close();

            proxy = proxies.shift();

            if (err.message.startsWith('net::ERR_') || err.name === 'TimeoutError' || err.name === 'BanError') {
                return await this.fetchReleases(lastRelease, null, false);
            } else {
                console.log(err);
                return false;
            }
        }
    },
    getURL: function() {
        return URL;
    },
    isOn: function() {
        return status;
    }
};

async function getProxies() {
    debug('fetching proxy list...');

    const browser = await puppeteer.launch({
        args: ['--lang=en', '--no-sandbox']
    });
    const page = await browser.newPage();

    await page.goto(PROXY_LIST_URL.toString());

    await page.click('a[href^="https/"]');

    await page.waitForSelector('#dataID table');

    await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });

    const result = await page.evaluate(() => {
        const result = {
            successful: true,
            proxies: []
        };

        try {
            // loop through every row
            $('#dataID table tbody tr').each(function() {
                if ($(this).find('td').length == 2) {
                    const proxy = $(this).find('td').eq(0).text() + ':' + $(this).find('td').eq(1).text();
                    result.proxies.push(proxy);
                }
            });
        } catch (err) {
            result.successful = false;
            result.error = err;
        }

        return result;
    });

    await browser.close();

    if (result.successful) {
        if (result.debug) {
            debug(result.debug);
        }

        proxies = result.proxies;

        return;
    } else {
        throw new Error(result.error);
    }
}

async function loadPage(page, lastRelease) {
    let url = URL
        .clone()
        .segment('torrents.php')
        .addQuery({ category: '41;44;45', page: pageNumber })
        .toString();

    debug(url + ' @' + proxy);

    await page.setDefaultNavigationTimeout(60 * 1000);
    await page.goto(url);
    await _.bind(pageLoadedHandler, this)(page, lastRelease);
}

async function pageLoadedHandler(page, lastRelease, attempt) {
    attempt = attempt || 0;

    if (attempt > 1) return await _.bind(loadPage, this)(page, lastRelease);

    const hasjQuery = await page.evaluate(() => {
        return (typeof window.$ === 'function');
    });

    if (!hasjQuery) {
        await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });
    }

    const pageLoaded = await page.evaluate(() => {
        let pageLoaded = 'unknown';

        try {
            if ($('.lista2t').length) {
                pageLoaded = 'torrents';
            } else if ($('body:contains("Please wait while we try to verify your browser...")').length) {
                pageLoaded = 'verifying';
            } else if ($('a[href="/threat_defence.php?defence=1"]').attr('href')) {
                pageLoaded = 'retry';
            } else if ($('#solve_string').length) {
                pageLoaded = 'captcha';
            } else if ($('body:contains("We have too many requests from your ip in the past 24h.")').length) {
                pageLoaded = 'banned';
            }
        } catch (err) {}

        return pageLoaded;
    });

    switch (pageLoaded) {
        case 'torrents':
            const done = await _.bind(getReleasesFromPage, this)(page, lastRelease);

            if (done) {
                return;
            } else {
                await sleep(((Math.random() * 5) + 10) * 1000);
                pageNumber++;
                return await _.bind(loadPage, this)(page, lastRelease);
            }
        case 'verifying':
            debug('verifying the browser...');
            await sleep(10 * 1000);
            return await _.bind(pageLoadedHandler, this)(page, lastRelease, ++attempt);
        case 'retry':
            debug('retry verifying the browser...');
            await verifyBrowser(page);
            return await _.bind(pageLoadedHandler, this)(page, lastRelease);
        case 'captcha':
            debug('solving captcha...');
            await solveCaptcha(page);
            return await _.bind(loadPage, this)(page, lastRelease);
        case 'banned':
            debug('banned...');
            const e = new Error('banned');
            e.name = 'BanError';
            throw e;
        default:
            debug('unknown page loaded');
            await unknownPage(page);
            throw new Error('unknown page loaded');
    }
}

async function getReleasesFromPage(page, lastRelease) {
    await page.addScriptTag({ path: 'node_modules/moment/min/moment.min.js' });
    await page.addScriptTag({ path: 'node_modules/moment-timezone/builds/moment-timezone-with-data.min.js' });

    const result = await page.evaluate((lastRelease) => {
        const page = parseInt($('#pager_links').find('b').text());
        const result = {
            successful: true,
            releases: [],
            done: false
        };

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

        try {
            // loop through every row
            $('.lista2t .lista2').each(function() {
                const col1 = $(this).find('.lista').eq(0);
                const col2 = $(this).find('.lista').eq(1);
                const col3 = $(this).find('.lista').eq(2);

                const release = {
                    _id: null,
                    name: $(col2).find('a[href^="/torrent/"]').text().trim().replace(/\[.+\]$/, ''),
                    category: parseInt(regex($(col1).find('a[href^="/torrents.php?category="]').attr('href'), /\/torrents\.php\?category=(\d+)/i)),
                    pubdate: $(col3).text().trim(),
                    imdbId: regex($(col2).find('a[href^="/torrents.php?imdb="]').attr('href'), /\/torrents\.php\?imdb=(tt\d+)/i),
                    type: null,
                    quality: null,
                    page: page
                };

                // validation
                if (release.name && [41, 44, 45].indexOf(release.category) !== -1 && moment(release.pubdate, 'YYYY-MM-DD HH:mm:ss').isValid()) {
                    const pubdate = moment.tz(release.pubdate, 'YYYY-MM-DD HH:mm:ss', 'Europe/Berlin').tz('Europe/Lisbon');

                    // define stop point
                    if (lastRelease && pubdate.isSameOrBefore(lastRelease.pubdate)) {
                        if (release.name === lastRelease.name || pubdate.isBefore(lastRelease.pubdate)) {
                            result.debug = 'site scraping done at ' + pubdate.format('YYYY-MM-DD HH:mm:ss');
                            result.done = true;
                            return false;
                        }
                    }

                    release._id = release.name.replace(/[^\w_]/g, '').toUpperCase();
                    release.pubdate = pubdate.format();
                    release.type = (release.category == 41 ? 'show' : 'movie');
                    release.quality = (release.name.indexOf('1080p') !== -1 ? '1080p' : '720p');

                    result.releases.push(release);
                } else {
                    throw new Error('site scraping: ' + release.name + '|' + release.category + '|' + release.pubdate);
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
    }, lastRelease);

    if (result.successful) {
        if (result.debug) {
            debug(result.debug);
        }

        const _this = this;

        _.forEach(result.releases, function(release) {
            _this.newReleases[release._id] = release;
        });

        return result.done;
    } else {
        throw new Error(result.error);
    }
}

async function solveCaptcha(page) {
    await page.addScriptTag({ path: 'providers/gocr.js' });

    const navigationPromise = page.waitForNavigation();

    await page.evaluate(() => {
        var img = $('img[src^="/threat_captcha.php"]')[0];

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
    });

    await navigationPromise;
}

async function verifyBrowser(page) {
    await page.click('a[href="/threat_defence.php?defence=1"]');
}

async function unknownPage(page) {
    const fs = require('fs');

    const content = await page.content();
    const now = new Date();
    const fileName = 'debug/rarbg_unknownpage_' + now.toISOString().slice(0, 19).replace(/:/g, '') + '.html';

    fs.writeFileSync(fileName, content);
}

function sleep(ms = 0) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = RARBG;