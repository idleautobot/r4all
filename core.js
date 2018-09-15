'use strict';

const debug = require('debug')('Core');
const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const oleoo = require('oleoo');

const log = require('./logger.js');
const settings = require('./settings.js');
const common = require('./common.js');
const db = require('./database.js');
const providers = {
    rarbg: require('./providers/rarbg.js'),
    imdb: require('./providers/imdb.js'),
    //###
    //addic7ed: require('./providers/addic7ed.js'),
    //legendasdivx: require('./providers/legendasdivx.js')
};

let status = true;
let isBusy = false;
let refreshes = 0;
let lastRefresh = null;

const Core = {
    refresh: async function() {
        status = true;
        isBusy = true;

        debug('refreshing...');

        try {
            const newReleases = await fetchReleases();

            await upsertReleases(newReleases);

            await verifyReleases();

            await refreshIMDbOutdated();

            imdbList.clear();

            refreshes++;
            lastRefresh = moment();

            timer.set();
            isBusy = false;

            debug('refresh done!');

            return;
        } catch (err) {
            log.fatal('[core] ' + err.stack);

            timer.clear();
            isBusy = false;
            status = false;

            return;
        };
    },
    // ###
    fetchSubtitle: async function(releaseId, forceFetch) {
        // **************************************************
        // fetchSubtitle
        //   forceFetch:
        //     - on movies it will get a subtitle event if it's not a ripped one.
        //     - on shows it will just fetch the subtitle again (the most updated)
        // **************************************************
        // var type;
        // var subtitleExists;

        // return db.getReleaseSubtitle(releaseId)
        //     .then(function(release) {
        //         if (!release) return;

        //         type = release.imdb.type;
        //         subtitleExists = !!release.subtitle;

        //         if (type == 'movie') {
        //             return release.subtitle || providers.legendasdivx.fetchSubtitle(release.name, release.imdbId, forceFetch);
        //         } else {
        //             if (!release.imdb.addic7edId) {
        //                 providers.addic7ed.fetchShow(release.imdb.title, release.imdb.year)
        //                     .then(function(addic7edId) {
        //                         if (!addic7edId) return;

        //                         var imdbInfo = {
        //                             _id: release.imdb._id,
        //                             addic7edId: addic7edId,
        //                             isVerified: false
        //                         };

        //                         return db.upsertIMDb(imdbInfo);
        //                     });

        //                 return;
        //             } else {
        //                 return (!forceFetch && release.subtitle) || providers.addic7ed.fetch(release.name, release.imdb.addic7edId);
        //             }
        //         }
        //     })
        //     .then(function(subtitle) {
        //         if (!subtitle) return;

        //         var r = {
        //             _id: releaseId,
        //             subtitle: subtitle
        //         };

        //         return Promise.resolve(((type == 'show' && (!subtitleExists || forceFetch)) || (type == 'movie' && !subtitleExists && !forceFetch)) && db.upsertRelease(r))
        //             .then(function() {
        //                 return subtitle;
        //             });
        //     });
    },
    stop: function() {
        timer.clear();
        status = false;
    },
    isOn: function() {
        return status;
    }
};

const timer = {
    timerId: null,
    set: function() {
        this.timerId = setTimeout(Core.refresh, settings.coreRefreshInterval);
    },
    clear: function() {
        clearTimeout(this.timerId);
    }
};

const imdbList = {
    data: {},
    add: function(imdbInfo) {
        this.data[imdbInfo._id] = imdbInfo;
    },
    get: function(_id) {
        return this.data[_id];
    },
    clear: function() {
        this.data = {};
    }
};

// **************************************************
// fetch releases
// **************************************************
async function fetchReleases() {
    debug('fetching new releases...');

    const rarbg = providers.rarbg;

    let [lastRelease, bootstrap] = await Promise.all([
        db.getLastRelease(),
        db.getBootstrap()
    ]);

    if (bootstrap.done) {
        bootstrap.lastPage = null;
    } else {
        lastRelease = null;
        bootstrap.lastPage = bootstrap.lastPage || 1;
    }

    const success = await rarbg.fetchReleases(lastRelease, bootstrap.lastPage);

    if (_.isEmpty(rarbg.newReleases) || (!success && bootstrap.done)) {
        return [];
    }

    const newReleases = _.sortBy(rarbg.newReleases, 'pubdate');

    if (!bootstrap.done) {
        await db.upsertBootstrap({
            done: success,
            lastPage: _.max([bootstrap.lastPage, _.maxBy(newReleases, 'page').page])
        });
    }

    return newReleases;
}

// **************************************************
// upsert releases
// **************************************************
async function upsertReleases(releases) {
    debug('upserting new releases...');

    for (const release of releases) {
        var parsed = null;

        try {
            parsed = oleoo.parse(release.name, { strict: true });
            parsed = ((release.type == 'movie' && parsed.type == 'movie') || (release.type == 'show' && parsed.type == 'tvshow')) && parsed;
        } catch (err) {}

        if (release.type == 'show' && parsed) {
            release.season = parsed.season;
            release.episodes = parsed.episodes;
        }

        if (!release.imdbId || !parsed) {
            release.isVerified = false;
        }

        await db.upsertRelease(release);
    }
}

// **************************************************
// verify releases
// **************************************************
async function verifyReleases() {
    debug('verifying releases...');

    const releases = await db.getReleasesToVerify();

    for (const release of releases) {
        await verifyRelease(release);
    }
}

async function verifyRelease(release) {
    if (release.type == 'movie') {
        await verifyMovie(release);
    } else {
        await verifyShow(release);
    }
}

//###
function verifyMovie(release) {
    return Promise.resolve(imdbList.get(release.imdbId) || providers.imdb.fetchInfo(release.imdbId, release.type))
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
                    imdbList.add(imdbInfo);
                    return db.upsertRelease(r);
                });
        });
}
//###
function verifyShow(release) {
    return Promise.resolve(imdbList.get(release.imdbId) || providers.imdb.fetchInfo(release.imdbId, release.type))
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
                    imdbList.add(imdbInfo);
                    return db.upsertRelease(r);
                });
        });
}

// **************************************************
// database maintenance
// **************************************************
async function refreshIMDbOutdated() {
    debug('refreshing IMDb data...');

    const doc = await db.getIMDbOutdated();

    if (doc) {
        const imdbInfo = await providers.imdb.fetch(doc._id, doc.type);
        imdbInfo && await db.upsertIMDb(imdbInfo);
    }
}

module.exports = Core;