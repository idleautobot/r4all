'use strict';

var debug = require('debug')('TMDb');
var Promise = require('bluebird');
var URI = require('urijs');

var log = require('../logger.js');

var MovieDB = Promise.promisifyAll(require('moviedb')('9e7a54d8b8d4ea33d0dee0032532670a'));

var TMDb = function() {
    this.URL = URI('https://www.themoviedb.org');
    this.baseURL = null;

    // status
    this.isOn = true;
};
TMDb.prototype.constructor = TMDb;

var fetchMedia = function(res, type, baseURL) {
    var media = {};
    var objLabel = (type == 'movie' ? 'movie_results' : 'tv_results');

    // validation
    if (objLabel in res && res[objLabel].length != 0) {
        media.cover = res[objLabel][0]['poster_path'] ? baseURL + 'original' + res[objLabel][0]['poster_path'] : null;
        media.backdrop = res[objLabel][0]['backdrop_path'] ? baseURL + 'original' + res[objLabel][0]['backdrop_path'] : null;
    }

    return media;
};

TMDb.prototype.resizeImage = function(imageUrl, size) {
    var toSize;

    switch (size) {
        case 'thumb':
            toSize = '/w300/';
            break;
        case 'medium':
            toSize = '/w500/';
            break;
        default:
            toSize = '/original/';
    }

    return imageUrl.replace(/\/original\//i, toSize);
};

TMDb.prototype.fetch = function(imdbId, type) {
    var _this = this;

    return Promise.resolve(this.baseURL || MovieDB.configurationAsync())
        .then(function(res) {
            if (!_this.baseURL) {
                if ('images' in res && 'secure_base_url' in res.images) {
                    _this.baseURL = res.images.secure_base_url;
                } else {
                    throw 'unable to fetch baseURL';
                }
            }

            return MovieDB.findAsync({ id: imdbId, external_source: 'imdb_id' });
        })
        .then(function(res) {
            return fetchMedia(res, type, _this.baseURL);
        })
        .then(function(media) {
            if (!_this.isOn) {
                _this.isOn = true;
                debug('seems to be back');
            }

            return media;
        })
        .catch(function(err) {
            if (_this.isOn) {
                _this.isOn = false;
                log.error('[TMDb] ', err);
            }

            return null;
        });
};

module.exports = new TMDb;