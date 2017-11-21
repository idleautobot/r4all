'use strict';

var Promise = require('bluebird');
var zlib = require('zlib');
var request = require('request').defaults({
    method: 'GET',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:53.0) Gecko/20100101 Firefox/53.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate'
    },
    jar: true
});
var _ = require('lodash');
var URI = require('urijs');
var latenize = require('latenize');

var settings = require('./settings.js');

var req = function(url, options) {
    options = options || {};

    options.url = url;

    var r = request(options);

    return new Promise(function(resolve, reject) {
            r.on('response', function(res) {
                var chunks = [];

                res.on('data', function(chunk) {
                    chunks.push(chunk);
                });

                res.on('end', function() {
                    var buffer = Buffer.concat(chunks);
                    var encoding = res.headers['content-encoding'];

                    if (encoding == 'gzip') {
                        zlib.gunzip(buffer, function(err, decoded) {
                            if (err) reject(err);
                            else resolve(decoded && decoded.toString());
                        });
                    } else if (encoding == 'deflate') {
                        zlib.inflate(buffer, function(err, decoded) {
                            if (err) reject(err);
                            else resolve(decoded && decoded.toString());
                        });
                    } else {
                        resolve(buffer.toString());
                    }
                });
            });

            r.on('error', function(err) {
                reject(err);
            });
        })
        .timeout(settings.requestTimeout)
        .catch(Promise.TimeoutError, function(e) {
            r.abort();
            throw e;
        });
};

var common = module.exports = {
    request: function(url, options, retryAttempts) {
        retryAttempts = retryAttempts || 1;

        return new Promise(function(resolve, reject) {
            (function retry(attempt) {
                attempt = attempt || 1;

                return req(url, options)
                    .then(resolve)
                    .catch(function(err) {
                        if (attempt < retryAttempts) {
                            return Promise.delay(settings.requestAttemptsInterval)
                                .then(function() {
                                    return retry(++attempt);
                                });
                        } else {
                            return reject(err);
                        }
                    });
            })();
        });
    },

    unleak: function(str) { // cheerio+v8 "leaks" memory from original HTML
        if (typeof str === 'string') {
            return (' ' + str).substr(1);
        } else if (str === '[object Array]') {
            return str.map(this.unleak);
        } else {
            return str;
        }
    },

    regex: function(regex, str) { // regular expression match
        try {
            var match = str.match(regex);
            match.shift(); // remove original string that was parsed

            if (match.length == 1)
                return this.unleak(match[0]);
            else
                return this.unleak(match);
        } catch (err) {
            return null;
        }
    },

    resizeImage: function(imageUrl, providers, size) {
        if (!imageUrl) return imageUrl;

        var uri = URI(imageUrl);

        switch (uri.domain()) {
            case 'media-imdb.com':
                return providers.imdb.resizeImage(imageUrl, size);
            case 'image.tmdb.org':
                return providers.themoviedb.resizeImage(imageUrl, size);
            default:
                return imageUrl;
        }
    },

    scene: {
        tags: [],

        parseRelease: function(release) {
            var releaseName = release.name;
            var parsed = null;

            var toMatch = this.typeMatch[category];
            var regex, result;

            if (category.charAt(0) == 'm')
                regex = new RegExp('([\\w-.()]+?)(?:\\.(\\d{4}))?(?:\.(' + this.tags.join('|') + '))?\\.' + toMatch + '\\.x264-([\\w]+)', 'i');
            else
                regex = new RegExp('([\\w-.()]+?)\\.S?(\\d{1,2})((?:(?:\\.|-)?(?:E|x)\\d{1,2})+)([\\w-.()]*?)\\.' + toMatch + '(?:\\.|_)x264-([\\w]+)', 'i');

            result = common.rem(regex, releaseName);

            if (result) {
                parsed = {};

                if (category.charAt(0) == 'm') {
                    parsed.releaseTitle = result[0].replace(/_/g, '.').toUpperCase();
                    parsed.year = result[1] && parseInt(result[1]); // year
                    parsed.tag = result[2];
                    parsed.group = result[3];
                } else {
                    result[2] = result[2].match(/\d{1,2}/gi).map(function(ep) { // episodes array generator
                        return parseInt(ep, 10);
                    });

                    parsed.releaseTitle = result[0].replace(/_/g, '.').toUpperCase();
                    parsed.season = parseInt(result[1], 10); // season
                    parsed.episodes = [];
                    parsed.tag = result[3];
                    parsed.group = result[4];

                    for (var i = result[2][0]; i <= result[2][result[2].length - 1]; i++) { // fill in all episodes
                        parsed.episodes.push(i);
                    }
                }
            }

            return parsed;
        },

        // parseMovieRelease: function() {

        // },

        // parseShowRelease: function() {

        // },

        titleEncode: function(title) {
            return latenize(title) // replace accented characters with non accented
                .replace(/&/g, 'and') // replace & for and
                .replace(/\+/g, 'plus') // replace + for plus
                .replace(/ |:|-|!|,|\//g, '.') // replace some special characters with dot
                .replace(/[^\w-.()]+/g, '') // remove not allowed characters - ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._()
                .replace(/\.+/g, '.') // replace multiple dots with single dot
                .replace(/^\./, '') // remove initial dot from string
                .replace(/\.$/, ''); // remove final dot from string
        }
    }
};
