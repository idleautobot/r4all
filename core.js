'use strict';

var debug = require('debug')('Core');
var Promise = require('bluebird');
var _ = require('lodash');
var moment = require('moment');
var Release = require('scene-release-parser');

var log = require('./logger.js');
var settings = require('./settings.js');
var common = require('./common.js');
var db = require('./database.js');
var providers = {
    rarbg: require('./providers/rarbg.js'),
    imdb: require('./providers/imdb.js'),
    addic7ed: require('./providers/addic7ed.js'),
    legendasdivx: require('./providers/legendasdivx.js')
};

var Core = function() {
    // status
    this.isOn = false;
    this.isBusy = false;
    this.refreshes = 0;
    this.lastRefresh = null;

    var timer;

    // data
    var imdbList = {};

    this.setTimer = function() {
        timer = setTimeout(_.bind(this.refresh, this), settings.coreRefreshInterval);
    };

    this.clearTimer = function() {
        clearTimeout(timer);
    };

    this.clearIMDbInfo = function() {
        imdbList = {};
    };

    this.addIMDbInfo = function(imdbInfo) {
        imdbList[imdbInfo._id] = imdbInfo;
    };

    this.getIMDbInfo = function(_id) {
        return imdbList[_id];
    };
};
Core.prototype.constructor = Core;

// **************************************************
// fetch & upsert releases
// **************************************************
var fetchReleases = function() {
    var rarbg = providers.rarbg;

    var _this = this;

    return Promise.join(db.getLastPage(), db.getLastRelease(), function(lastPage, lastRelease) {
            if (settings.bootstrapDatabase) {
                rarbg.lastPage = lastPage && lastPage.page;
            } else {
                rarbg.lastRelease = lastRelease;
            }

            return rarbg.fetchReleases();
        })
        .then(function(success) {
            if ((!success && !settings.bootstrapDatabase) || _.isEmpty(rarbg.newReleases)) {
                return [];
            }

            // database bootstrap is done!
            if (settings.bootstrapDatabase && success) {
                settings.bootstrapDatabase = false;
            }

            return _.sortBy(rarbg.newReleases, 'pubdate');
        });
};

// **************************************************
// verify releases
// **************************************************
var verifyRelease = function(release) {
    if (release.type == 'movie') {
        return _.bind(verifyMovie, this)(release);
    } else {
        return _.bind(verifyShow, this)(release);
    }
};

var verifyMovie = function(release) {
    var _this = this;

    return Promise.resolve(this.getIMDbInfo(release.imdbId) || providers.imdb.fetchInfo(release.imdbId, release.type))
        .then(function(imdbInfo) {
            if (!imdbInfo) {
                return;
            }

            var parsed = new Release(release.name);
            var validated = false;

            // Movie Title check
            var releaseTitle = parsed.title.replace(/-/g, '.').toUpperCase(); // fix: replace allowed character '-' with dot - some releases replace with dot
            var movieTitleEncoded = common.scene.titleEncode(imdbInfo.title).toUpperCase(); // encode imdb movie title

            if (movieTitleEncoded != '' && (releaseTitle.indexOf(movieTitleEncoded) != -1 || movieTitleEncoded.indexOf(releaseTitle) != -1)) { // compare movie title
                validated = true;
            } else {
                imdbInfo.akas.some(function(aka) {
                    movieTitleEncoded = common.scene.titleEncode(aka).toUpperCase();

                    if (movieTitleEncoded != '' && (releaseTitle.indexOf(movieTitleEncoded) != -1 || movieTitleEncoded.indexOf(releaseTitle) != -1)) { // compare aka movie title
                        imdbInfo.aka = aka;
                        validated = true;
                        return true;
                    }

                    return false;
                });
            }

            // Year && Type check
            validated = validated && (imdbInfo.year == parseInt(parsed.year));

            var pubdateProperty = 'pubdate' + release.quality;
            var r = {
                _id: release._id,
                imdbId: imdbInfo._id, // because of imdb redirects, initial imdbId could not be the final one)
                isVerified: validated
            };

            if (release.imdb == null || release.imdb[pubdateProperty] == null) {
                imdbInfo[pubdateProperty] = release.pubdate;
            }

            return db.upsertIMDb(imdbInfo)
                .then(function() {
                    _this.addIMDbInfo(imdbInfo);
                    return db.upsertRelease(r);
                });
        });
};

var verifyShow = function(release) {
    var _this = this;

    return Promise.resolve(this.getIMDbInfo(release.imdbId) || providers.imdb.fetchInfo(release.imdbId, release.type))
        .then(function(imdbInfo) {
            if (!imdbInfo) {
                return;
            }

            var isNewEpisodePromise;
            var pubdateProperty = 'pubdate' + release.quality;
            var r = {
                _id: release._id,
                imdbId: imdbInfo._id, // because of imdb redirects, initial imdbId could not be the final one)
                isVerified: true
            };

            if (release.imdb == null || release.imdb[pubdateProperty] == null) {
                isNewEpisodePromise = Promise.resolve(true);
            } else {
                isNewEpisodePromise = db.getLastEpisode(imdbInfo._id, release.quality)
                    .then(function(lastEpisode) {
                        // return isNewEpisode
                        return (release.season > lastEpisode.season) || (release.season == lastEpisode.season && _.max(release.episodes) > lastEpisode.episodes) || (release._id == lastEpisode._id);
                    });
            }

            return isNewEpisodePromise
                .then(function(isNewEpisode) {
                    if (isNewEpisode) {
                        imdbInfo[pubdateProperty] = release.pubdate;
                    }

                    return db.upsertIMDb(imdbInfo);
                })
                .then(function() {
                    _this.addIMDbInfo(imdbInfo);
                    return db.upsertRelease(r);
                });
        });
};

// **************************************************
// database maintenance
// **************************************************
var refreshIMDbOutdated = function() {
    return db.getIMDbOutdated()
        .then(function(doc) {
            return doc && providers.imdb.fetchInfo(doc._id, doc.type)
        })
        .then(function(imdbInfo) {
            return imdbInfo && db.upsertIMDb(imdbInfo);
        });
};

// **************************************************
// fetchSubtitle
//   forceFetch:
//     - on movies it will get a subtitle event if it's not a ripped one.
//     - on shows it will just fetch the subtitle again (the most updated)
// **************************************************
Core.prototype.fetchSubtitle = function(releaseId, forceFetch) {
    var type;
    var subtitleExists;

    return db.getReleaseSubtitle(releaseId)
        .then(function(release) {
            if (!release) return;

            type = release.imdb.type;
            subtitleExists = !!release.subtitle;

            if (type == 'movie') {
                return release.subtitle || providers.legendasdivx.fetchSubtitle(release.name, release.imdbId, forceFetch);
            } else {
                if (!release.imdb.addic7edId) {
                    providers.addic7ed.fetchShow(release.imdb.title, release.imdb.year)
                        .then(function(addic7edId) {
                            if (!addic7edId) return;

                            var imdbInfo = {
                                _id: release.imdb._id,
                                addic7edId: addic7edId,
                                isVerified: false
                            };

                            return db.upsertIMDb(imdbInfo);
                        });

                    return;
                } else {
                    return (!forceFetch && release.subtitle) || providers.addic7ed.fetch(release.name, release.imdb.addic7edId);
                }
            }
        })
        .then(function(subtitle) {
            if (!subtitle) return;

            var r = {
                _id: releaseId,
                subtitle: subtitle
            };

            return Promise.resolve(((type == 'show' && (!subtitleExists || forceFetch)) || (type == 'movie' && !subtitleExists && !forceFetch)) && db.upsertRelease(r))
                .then(function() {
                    return subtitle;
                });
        });
};

// **************************************************
// controller
// **************************************************
Core.prototype.stop = function() {
    this.clearTimer();
    this.isOn = false;
};

Core.prototype.refresh = function() {
    this.isBusy = true;

    if (!this.isOn) {
        this.isOn = true;
    }

    debug('refreshing...');
    debug('fetching new releases...');

    var _this = this;

    return _.bind(fetchReleases, this)()
        .each(function(release) {
            var parsed = null;

            try {
                parsed = new Release(release.name);
                parsed = ((release.type == 'movie' && parsed.type == 'movie') || (release.type == 'show' && parsed.type == 'tvshow')) && parsed;
            } catch (err) {}

            if (release.type == 'show' && parsed) {
                release.season = parsed.season;
                release.episodes = parsed.episodes;
            }

            if (!release.imdbId || !parsed) {
                release.isVerified = false;
            }

            return db.upsertRelease(release);
        })
        .then(function() {
            debug('verifying releases...');

            return db.getReleasesToVerify();
        })
        .each(function(release) {
            return _.bind(verifyRelease, _this)(release);
        })
        .then(function() {
            debug('refreshing IMDb data...');

            return refreshIMDbOutdated();
        })
        .then(function() {
            _this.clearIMDbInfo();

            _this.refreshes++;
            _this.lastRefresh = moment();

            _this.setTimer();
            _this.isBusy = false;

            debug('refresh done!');

            return;
        })
        .catch(function(err) {
            log.error('[core] ', err);

            _this.stop();
            _this.isBusy = false;

            return null;
        });
};

module.exports = new Core;