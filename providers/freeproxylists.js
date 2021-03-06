'use strict';

const debug = require('debug')('FreeProxyLists');
const URI = require('urijs');
const puppeteer = require('puppeteer-core');

const log = require('../logger.js');
const settings = require('../settings.js');

const URL = URI('http://www.freeproxylists.com/https.html');

let status = true;

const FreeProxyLists = {
    fetchList: async function() {
        return new Promise(async function(resolve, reject) {
            await fetchList(resolve);
        });
    },
    getURL: function() {
        return URL;
    },
    isOn: function() {
        return status;
    }
};

async function fetchList(resolve) {
    debug('fetching proxy list...');

    let browser = null;

    try {
        browser = await puppeteer.launch({
            executablePath: settings.chromiumPath,
            args: ['--lang=en'],
            userDataDir: 'r4all-profile'
        });

        const page = await browser.newPage();

        page.on('error', async function(err) {
            debug('PageOnError: ' + err.message);

            setTimeout(async function() {
                try { await browser.close(); } catch (err) {}
                resolve([]);
            }, 5000);
        });

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

            resolve(result.proxies);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        try { await browser.close(); } catch (err) {}

        status = false;
        log.crit('[FreeProxyLists] ' + (err.stack || err));

        resolve([]);
    }
}

module.exports = FreeProxyLists;