'use strict';

const debug = require('debug')('RARBG');
const _ = require('lodash');
const URI = require('urijs');
const puppeteer = require('puppeteer');

const log = require('../logger.js');

let status = true;
const URL = URI('https://rarbg.to');

class RARBG {
    static async fetchReleases(lastRelease, lastPage) {
        // init
        this.newReleases = {};

        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        try {
            await _.bind(loadPage, this)(page, lastRelease, lastPage);

            if (!status) {
                status = true;
                debug('seems to be back');
            }

            await browser.close();
            return true;
        } catch (err) {
            if (status) {
                status = false;
                log.error('[RARBG]', err);
            }

            await browser.close();
            return false;
        }
    }

    static getURL() {
        return URL;
    }

    static isOn() {
        return status;
    }
}

async function loadPage(page, lastRelease, pageNumber) {
    pageNumber = pageNumber || 1;

    let url = URL
        .clone()
        .segment('torrents.php')
        .addQuery({ category: '41;44;45', page: pageNumber })
        .toString();

    debug(url);

    await page.goto(url);
    await _.bind(pageLoadedHandler, this)(page, lastRelease, pageNumber);
}

async function pageLoadedHandler(page, lastRelease, pageNumber, attempt) {
    attempt = attempt || 0;

    if (attempt > 1) return await _.bind(loadPage, this)(page, lastRelease, pageNumber);

    const hasjQuery = await page.evaluate(() => {
        return (typeof window.$ === 'function');
    });

    if (!hasjQuery) {
        await page.addScriptTag({ path: 'node_modules/jquery/dist/jquery.min.js' });
    }

    const pageLoaded = await page.evaluate(() => {
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
    });

    switch (pageLoaded) {
        case 'torrents':
            const done = await _.bind(getReleasesFromPage, this)(page, lastRelease);

            if (done) {
                return;
            } else {
                await sleep(((Math.random() * 30) + 30) * 1000);
                return await _.bind(loadPage, this)(page, lastRelease, ++pageNumber);
            }
        case 'captcha':
            debug('solving captcha...');
            await solveCaptcha(page);
            return await _.bind(loadPage, this)(page, lastRelease, pageNumber);
        case 'verify':
            debug('triggering verify the browser...');
            await verifyBrowser(page);
            return await _.bind(loadPage, this)(page, lastRelease, pageNumber);
        case 'verifying':
            debug('verifying the browser...');
            await sleep(5 * 1000);
            return await _.bind(pageLoadedHandler, this)(page, lastRelease, pageNumber, ++attempt);
        case 'banned':
            debug('banned...');
            throw ('banned');
        default:
            debug('unknown page loaded');
            await unknownPage(page);
            throw ('unknown page loaded');
    }
}

async function getReleasesFromPage(page, lastRelease) {
    await page.addScriptTag({ path: 'node_modules/moment/min/moment.min.js' });
    await page.addScriptTag({ path: 'node_modules/moment-timezone/builds/moment-timezone-with-data.min.js' });

    const result = await page.evaluate((lastRelease) => {
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
                    throw 'site scraping: ' + release.name + '|' + release.category + '|' + release.pubdate;
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
        throw result.error;
    }
}

async function solveCaptcha(page) {
    await page.addScriptTag({ path: 'providers/gocr.js' });

    await page.evaluate(() => {
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
    });

    await page.waitForNavigation();
}

async function verifyBrowser(page) {
    await page.click('a[href="/threat_defence.php?defence=1"]');
    await page.waitForNavigation();
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