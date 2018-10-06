'use strict';

const debug = require('debug')('FreeProxyLists');
const URI = require('urijs');
const puppeteer = require('puppeteer');

const log = require('../logger.js');

const URL = URI('http://www.freeproxylists.com/https.html');

let status = true;

const FreeProxyLists = {
    fetchList: async function() {
            debug('fetching proxy list...');

            let browser = null;

            try {
                browser = await puppeteer.launch({
                    args: ['--lang=en', '--no-sandbox', '--disable-dev-shm-usage'],
                    userDataDir: 'chromium-profile'
                });

                const page = await browser.newPage();

                let url = URL.toString();

                debug(url);

                await page.goto(url);

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
                        result.error = err.stack;
                    }

                    return result;
                });

                await browser.close();

                if (result.successful) {
                    if (!status) {
                        status = true;
                        debug('seems to be back');
                    }

                    return result.proxies;
                } else {
                    throw new Error(result.error);
                }
            } catch (err) {
                try { await browser.close(); } catch (err) {};

                status = false;
                log.crit('[FreeProxyLists] ' + (err.stack || err));

                return [];
            }
        },
        getURL: function() {
            return URL;
        },
        isOn: function() {
            return status;
        }
};

module.exports = FreeProxyLists;