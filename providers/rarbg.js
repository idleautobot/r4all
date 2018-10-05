'use strict';

const debug = require('debug')('RARBG');
const _ = require('lodash');
const URI = require('urijs');
const URITemplate = require('urijs/src/URITemplate');
const puppeteer = require('puppeteer');
const { TimeoutError } = require('puppeteer/Errors');

const log = require('../logger.js');
const freeproxylists = require('./freeproxylists.js');

const URL = URI('https://rarbg.to');
const TORRENT_URL = URITemplate(URL.toString() + 'torrent/{tid}');
const RARBG_PAGES = {
    torrentList: 'torrentList',
    torrent: 'torrent',
    verifying: 'verifying',
    retry: 'retry',
    captcha: 'captcha',
    cloudflare: 'cloudflare',
    empty: 'empty',
    banned: 'banned',
    unknown: 'unknown'
};
const RARBG_PAGES_ERROR = {
    cloudflare: 'cloudflare protection...',
    empty: 'page is empty...',
    banned: 'banned...'
};

let status = true;
let runCounter = 0;
let runs = {};
let proxies = [];
let proxy = null;

const RARBG = {
    fetchReleases: async function(lastRelease, lastPage) {
            return new Promise(async function(resolve, reject) {
                await fetchReleases(++runCounter, resolve, lastRelease, lastPage);
            });
        },
        fetchMagnet: async function(tid) {
                return new Promise(async function(resolve, reject) {
                    await fetchMagnet(++runCounter, resolve, tid);
                });
            },
            getURL: function() {
                return URL;
            },
            isOn: function() {
                return status;
            }
};

async function fetchReleases(currRun, resolve, lastRelease, pageNumber, releases = {}, instance = 0) {
    runs[currRun] = instance;
    pageNumber = pageNumber || 1;

    let isInit = true;
    let done = false;
    let browser = null;
    let page = null;

    while (!done) {
        try {
            if (isInit) {
                isInit = false;

                if (_.isEmpty(proxies)) proxies = await freeproxylists.fetchList();
                if (_.isEmpty(proxies)) break;

                proxy = proxy || proxies.shift();

                //try { await page.close(); } catch (err) {};
                try { await browser.close(); } catch (err) {};

                browser = await puppeteer.launch({
                    args: ['--lang=en', '--proxy-server=' + proxy, '--no-sandbox', '--disable-dev-shm-usage'],
                    userDataDir: 'chromium-profile'
                });

                runs[currRun] = ++instance;

                page = await browser.newPage();

                page.on('error', async function(err) {
                    if (instance === runs[currRun]) {
                        debug('PageOnError: ' + err.message);

                        setTimeout(async function() {
                            //try { await page.close(); } catch (err) {};
                            try { await browser.close(); } catch (err) {};
                            await fetchReleases(currRun, resolve, lastRelease, pageNumber, releases, instance);
                        }, 5000);
                    } else {
                        debug('Unexpected PageOnError from instance ' + instance + ' whilst on ' + runs[currRun] + ' instance: ' + err.message);
                    }
                });
            }

            await loadReleaseListPage(page, pageNumber, currRun, instance);
            done = await pageLoadedHandler(page, RARBG_PAGES.torrentList, { lastRelease: lastRelease, releases: releases });

            pageNumber++;

            if (done && !status) {
                status = true;
                debug('seems to be back');
            }
        } catch (err) {
            if (instance === runs[currRun]) {
                if (err.message.startsWith('net::ERR') || err instanceof TimeoutError || err.name === 'KnownError') {
                    debug(err.message);
                    isInit = true;
                    proxy = proxies.shift();
                } else if (err.name === 'ReloadPage') {
                    // do nothing
                } else {
                    status = false;
                    log.crit('[RARBG] ' + (err.stack || err));
                    break;
                }
            } else {
                debug('Unexpected OnError from instance ' + instance + ' whilst on ' + runs[currRun] + ' instance: ' + err.message);
                return;
            }
        }

        //isInit = true;
    }

    //try { await page.close(); } catch (err) {};
    try { await browser.close(); } catch (err) {};

    delete runs[currRun];

    resolve({ success: done, releases: releases });
}

async function fetchMagnet(currRun, resolve, tid, instance = 0) {
    runs[currRun] = instance;

    let isInit = true;
    let done = false;
    let browser = null;
    let page = null;
    let magnet = null;

    while (!done) {
        try {
            if (isInit) {
                isInit = false;

                if (_.isEmpty(proxies)) proxies = await freeproxylists.fetchList();
                if (_.isEmpty(proxies)) break;

                proxy = proxy || proxies.shift();

                //try { await page.close(); } catch (err) {};
                try { await browser.close(); } catch (err) {};

                browser = await puppeteer.launch({
                    args: ['--lang=en', '--proxy-server=' + proxy, '--no-sandbox', '--disable-dev-shm-usage'],
                    userDataDir: 'chromium-profile'
                });

                runs[currRun] = ++instance;

                page = await browser.newPage();

                page.on('error', async function(err) {
                    if (instance === runs[currRun]) {
                        debug('PageOnError: ' + err.message);

                        setTimeout(async function() {
                            //try { await page.close(); } catch (err) {};
                            try { await browser.close(); } catch (err) {};
                            await fetchMagnet(currRun, resolve, tid, instance);
                        }, 5000);
                    } else {
                        debug('Unexpected PageOnError from instance ' + instance + ' whilst on ' + runs[currRun] + ' instance: ' + err.message);
                    }
                });
            }

            await loadTorrentPage(page, tid, currRun, instance);
            magnet = await pageLoadedHandler(page, RARBG_PAGES.torrent);

            done = true;

            if (done && !status) {
                status = true;
                debug('seems to be back');
            }
        } catch (err) {
            if (instance === runs[currRun]) {
                if (err.message.startsWith('net::ERR') || err instanceof TimeoutError || err.name === 'KnownError') {
                    debug(err.message);
                    isInit = true;
                    proxy = proxies.shift();
                } else if (err.name === 'ReloadPage') {
                    // do nothing
                } else {
                    status = false;
                    log.crit('[RARBG] ' + (err.stack || err));
                    break;
                }
            } else {
                debug('Unexpected OnError from instance ' + instance + ' whilst on ' + runs[currRun] + ' instance: ' + err.message);
                return;
            }
        }

        //isInit = true;
    }

    //try { await page.close(); } catch (err) {};
    try { await browser.close(); } catch (err) {};

    delete runs[currRun];

    resolve(magnet);
}

async function loadReleaseListPage(page, pageNumber, currRun, instance) {
    const url = URL
        .clone()
        .segment('torrents.php')
        .addQuery({ category: '41;44;45', page: pageNumber })
        .toString();

    debug('[' + currRun + ':' + instance + '] ' + url + ' @' + proxy);

    await page.setDefaultNavigationTimeout(60 * 1000);
    await page.goto(url);
}

async function loadTorrentPage(page, tid, currRun, instance) {
    const url = TORRENT_URL
        .expand({ tid: tid })
        .toString();

    debug('[' + currRun + ':' + instance + '] ' + url + ' @' + proxy);

    await page.setDefaultNavigationTimeout(60 * 1000);
    await page.goto(url);
}

async function pageLoadedHandler(page, expectedPage, io, attempt = 0) {
    let e;

    if (attempt > 1) {
        e = new Error();
        e.name = 'ReloadPage';
        throw e;
    }

    const pageLoaded = await getPageLoaded(page, expectedPage);

    switch (pageLoaded) {
        case RARBG_PAGES.torrentList:
            const done = await getReleasesFromPage(page, io);

            //if (!done) await sleep(((Math.random() * 5) + 10) * 1000);

            return done;
        case RARBG_PAGES.torrent:
            return await getTorrentMagnet(page);
        case RARBG_PAGES.verifying:
            debug('verifying the browser...');
            await page.waitForNavigation();
            return await pageLoadedHandler(page, expectedPage, io, ++attempt);
        case RARBG_PAGES.retry:
            debug('retry verifying the browser...');
            await verifyBrowser(page);
            return await pageLoadedHandler(page, expectedPage, io);
        case RARBG_PAGES.captcha:
            debug('solving captcha...');
            await solveCaptcha(page);
            e = new Error();
            e.name = 'ReloadPage';
            throw e;
        case RARBG_PAGES.cloudflare:
        case RARBG_PAGES.empty:
        case RARBG_PAGES.banned:
            e = new Error(RARBG_PAGES_ERROR[pageLoaded]);
            e.name = 'KnownError';
            throw e;
        default:
            await unknownPage(page);
            throw new Error('unknown page loaded');
    }
}

async function getPageLoaded(page, expectedPage) {
    const hasjQuery = await page.evaluate(() => {
        return (typeof window.$ === 'function');
    });

    if (!hasjQuery) {
        await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });
    }

    const pageLoaded = await page.evaluate((RARBG_PAGES, expectedPage) => {
        let pageLoaded = RARBG_PAGES.unknown;

        try {
            if ($('table.lista2t').length && expectedPage == RARBG_PAGES.torrentList) {
                pageLoaded = RARBG_PAGES.torrentList;
            } else if ($('table.lista').length && expectedPage == RARBG_PAGES.torrent) {
                pageLoaded = RARBG_PAGES.torrent;
            } else if ($('#cf-wrapper').length) {
                pageLoaded = RARBG_PAGES.cloudflare;
            } else if ($('body:empty').length) {
                pageLoaded = RARBG_PAGES.empty;
            } else if ($('body:contains("Please wait while we try to verify your browser...")').length) {
                pageLoaded = RARBG_PAGES.verifying;
            } else if ($('a[href="/threat_defence.php?defence=1"]').attr('href')) {
                pageLoaded = RARBG_PAGES.retry;
            } else if ($('#solve_string').length) {
                pageLoaded = RARBG_PAGES.captcha;
            } else if ($('body:contains("We have too many requests from your ip in the past 24h.")').length) {
                pageLoaded = RARBG_PAGES.banned;
            }
        } catch (err) {}

        return pageLoaded;
    }, RARBG_PAGES, expectedPage);

    return pageLoaded;
}

async function getReleasesFromPage(page, io) {
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
                    tid: regex($(col2).find('a[href^="/torrent/"]').attr('href'), /\/torrent\/(\w+)/i),
                    name: $(col2).find('a[href^="/torrent/"]').text().trim().replace(/\[.+\]$/, ''),
                    category: parseInt(regex($(col1).find('a[href^="/torrents.php?category="]').attr('href'), /\/torrents\.php\?category=(\d+)/i)),
                    pubdate: $(col3).text().trim(),
                    imdbId: regex($(col2).find('a[href^="/torrents.php?imdb="]').attr('href'), /\/torrents\.php\?imdb=(tt\d+)/i),
                    type: null,
                    quality: null,
                    magnet: null,
                    page: page
                };

                // validation
                if (release.name && [41, 44, 45].indexOf(release.category) !== -1 && moment(release.pubdate, 'YYYY-MM-DD HH:mm:ss').isValid()) {
                    const pubdate = moment.tz(release.pubdate, 'YYYY-MM-DD HH:mm:ss', 'Europe/Sarajevo').tz('Europe/Lisbon');

                    // define stop point
                    if (lastRelease && ((!moment(lastRelease.pubdate).isDST() || pubdate.clone().add(1, 'h').isDST()) && pubdate.isSameOrBefore(lastRelease.pubdate))) {
                        if (release.name === lastRelease.name || pubdate.isBefore(lastRelease.pubdate)) {
                            result.debug = 'site scraping done at ' + pubdate.format('YYYY-MM-DD HH:mm:ss');
                            result.done = true;
                            return false;
                        }
                    }

                    release._id = release.name.replace(/[^\w_]/g, '').toUpperCase();
                    release.pubdate = pubdate.valueOf();
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
            result.error = err.stack;
        }

        return result;
    }, io.lastRelease);

    if (result.successful) {
        if (result.debug) {
            debug(result.debug);
        }

        const _this = this;

        _.forEach(result.releases, function(release) {
            release.pubdate = new Date(release.pubdate);
            io.releases[release._id] = release;
        });

        return result.done;
    } else {
        throw new Error(result.error);
    }
}

async function getTorrentMagnet(page) {
    const magnet = await page.evaluate(() => {
        return $('a[href^="magnet:"]').attr('href');
    });

    return magnet;
}

async function solveCaptcha(page) {
    await page.addScriptTag({ path: 'providers/gocr.js' });

    await new Promise(async function(resolve, reject) {
        try {
            const navigationPromise = page.waitForNavigation().catch(reject);

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

            await navigationPromise.then(resolve);
        } catch (err) {
            reject(err);
        }
    });
}

async function verifyBrowser(page) {
    await new Promise(async function(resolve, reject) {
        try {
            const navigationPromise = page.waitForNavigation().catch(reject);
            await page.click('a[href="/threat_defence.php?defence=1"]');
            await navigationPromise.then(resolve);
        } catch (err) {
            reject(err);
        }
    });
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