'use strict';

const debug = require('debug')('TraktTv');
const Promise = require('bluebird');
const request = require('request');
const URI = require('urijs');

const log = require('../logger.js');

const URL = URI('https://twitter.com/traktapi');
const API_ENDPOINT = URI('https://api-v2launch.trakt.tv');
const CLIENT_ID = 'e789bf52a39f68bb829f86a78aa61e2f03fff1415079ce802c2b83a6ac9592ea';
const STATUS_CODES = {
    '400': 'Bad Request - request couldn\'t be parsed',
    '401': 'Unauthorized - OAuth must be provided',
    '403': 'Forbidden - invalid API key or unapproved app',
    '404': 'Not Found - method exists, but no record found',
    '405': 'Method Not Found - method doesn\'t exist',
    '409': 'Conflict - resource already created',
    '412': 'Precondition Failed - use application/json content type',
    '422': 'Unprocessable Entity - validation errors',
    '429': 'Rate Limit Exceeded',
    '500': 'Server Error',
    '503': 'Service Unavailable - server overloaded',
    '520': 'Service Unavailable - Cloudflare error',
    '521': 'Service Unavailable - Cloudflare error',
    '522': 'Service Unavailable - Cloudflare error'
};

let status = true;

const TraktTv = {
    fetch: async function(imdbId, type) {
            try {
                const media = {};

                const res = await get(type + 's/' + imdbId, {
                    extended: 'full'
                });

                // validation
                if ('trailer' in res) {
                    media.trailer = res.trailer;
                    media.state = res.status;
                }

                if (!status) {
                    status = true;
                    debug('seems to be back');
                }

                return media;
            } catch (err) {
                status = false;
                log.crit('[TraktTv] ' + (err.stack || err));

                return null;
            }
        },
        fetchEpisodes: async function(imdbId) {
                try {
                    const episodes = {};

                    const res = await get('shows/' + imdbId + '/seasons', {
                        extended: 'episodes'
                    });

                    for (let s = 0; res && s < res.length; s++) {
                        for (let ep = 0; res[s].episodes && ep < res[s].episodes.length; ep++) {
                            const season = res[s].episodes[ep].season;
                            const episode = res[s].episodes[ep].number;

                            const episodeInfo = await get('shows/' + imdbId + '/seasons/' + season + '/episodes/' + episode, {
                                extended: 'full'
                            });

                            episodes[episodeInfo.season] = episodes[season] || {};
                            episodes[episodeInfo.season][episodeInfo.number] = {
                                title: episodeInfo.title,
                                aired: new Date(episodeInfo.first_aired),
                                overview: episodeInfo.overview
                            };
                        }
                    }

                    return episodes;
                } catch (err) {
                    status = false;
                    log.crit('[TraktTv] ' + (err.stack || err));

                    return null;
                }
            },
            getURL: function() {
                return URL;
            },
            isOn: function() {
                return status;
            }
};

/*
 * Trakt v2
 * METHODS (http://docs.trakt.apiary.io/)
 */

function get(endpoint, getVariables) {
    return new Promise(function(resolve, reject) {
        getVariables = getVariables || {};

        const requestUri = API_ENDPOINT.clone()
            .segment(endpoint)
            .addQuery(getVariables)
            .toString();

        debug(requestUri);

        request({
            method: 'GET',
            url: requestUri,
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': CLIENT_ID
            }
        }, function(error, response, body) {
            if (error) {
                reject(error);
            } else if (response.statusCode >= 400) {
                reject(response.statusCode + ': ' + STATUS_CODES[response.statusCode]);
            } else {
                let res = {};

                try {
                    res = JSON.parse(body);
                } catch (err) {}

                resolve(res);
            }
        });
    });
}

module.exports = TraktTv;