'use strict';

const debug = require('debug')('TraktTv');
const Promise = require('bluebird');
const request = require('request');
const URI = require('urijs');

const log = require('../logger.js');

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
const URL = URI('https://twitter.com/traktapi');

const TraktTv = {
    fetch: async function(imdbId, type) {
        return get(type + 's/' + imdbId, {
                extended: 'full'
            })
            .then(fetchMedia)
            .then(function(media) {
                if (!status) {
                    status = true;
                    debug('seems to be back');
                }

                return media;
            })
            .catch(function(err) {
                if (status) {
                    status = false;
                    log.warn('[TraktTv]', err);
                }

                return null;
            });
    }
};

var fetchMedia = function(obj) {
    var media = {};

    // validation
    if ('trailer' in obj) {
        media.trailer = obj.trailer;
        media.state = obj.status;
    }

    return media;
};

/*
 * Trakt v2
 * METHODS (http://docs.trakt.apiary.io/)
 */

var get = function(endpoint, getVariables) {
    return new Promise(function(resolve, reject) {
        getVariables = getVariables || {};

        var requestUri = API_ENDPOINT.clone()
            .segment(endpoint)
            .addQuery(getVariables);

        debug(requestUri.toString());

        request({
            method: 'GET',
            url: requestUri.toString(),
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
                var res = {};

                try {
                    res = JSON.parse(body);
                } catch (e) {}

                resolve(res);
            }
        });
    });
};

module.exports = TraktTv;