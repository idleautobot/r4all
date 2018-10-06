'use strict';

const debug = require('debug')('TMDb');
const Promise = require('bluebird');
const URI = require('urijs');
const MovieDB = Promise.promisifyAll(require('moviedb')('9e7a54d8b8d4ea33d0dee0032532670a'));

const log = require('../logger.js');

const URL = URI('https://www.themoviedb.org');

let status = true;
let baseURL = null;

const TMDb = {
    fetch: async function(imdbId, type) {
            try {
                if (!baseURL) {
                    const res = await MovieDB.configurationAsync();

                    if ('images' in res && 'secure_base_url' in res.images) {
                        baseURL = res.images.secure_base_url;
                    } else {
                        throw 'unable to fetch baseURL';
                    }
                }

                const res = await MovieDB.findAsync({ id: imdbId, external_source: 'imdb_id' });

                const media = fetchMedia(res, type);

                if (!status) {
                    status = true;
                    debug('seems to be back');
                }

                return media;
            } catch (err) {
                status = false;
                log.crit('[TMDb] ' + (err.stack || err));

                return null;
            }
        },
        resizeImage: function(imageUrl, size) {
            let toSize;

            switch (size) {
                case 'thumb':
                    toSize = '/w300/';
                    break;
                case 'medium':
                    toSize = '/w500/';
                    break;
                default:
                    toSize = '/original/';
                    break;
            }

            return imageUrl.replace(/\/original\//i, toSize);
        },
        getURL: function() {
            return URL;
        },
        isOn: function() {
            return status;
        }
};

function fetchMedia(res, type) {
    const media = {};
    const objLabel = (type == 'movie' ? 'movie_results' : 'tv_results');

    // validation
    if (objLabel in res && res[objLabel].length != 0) {
        media.cover = res[objLabel][0]['poster_path'] ? baseURL + 'original' + res[objLabel][0]['poster_path'] : null;
        media.backdrop = res[objLabel][0]['backdrop_path'] ? baseURL + 'original' + res[objLabel][0]['backdrop_path'] : null;
    }

    return media;
}

module.exports = TMDb;