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

let status = false;
let isBusy = false;
let refreshCount = 0;
let lastRefresh = null;

const Core = {
    refresh: async function() {
        status = true;
        isBusy = true;

        debug('refreshing...');

        try {
            await fetchNewReleases();

            await setReleasesMagnetLink();

            await verifyReleases();

            await refreshReleaseOutdated();

            await refreshIMDbOutdated();

            imdbList.clear();

            refreshCount++;
            lastRefresh = moment();

            timer.set();
            isBusy = false;

            debug('refresh done!');

            return;
        } catch (err) {
            log.fatal('[core] ' + (err.stack || err));

            timer.clear();
            isBusy = false;
            status = false;

            return;
        }
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
        if (!isBusy) {
            timer.clear();
            status = false;
            return true;
        } else {
            return false;
        }
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
// fetch new releases
// **************************************************
async function fetchNewReleases() {
    debug('fetching new releases...');

    const rarbg = providers.rarbg;

    let [bootstrap, lastRelease] = await Promise.all([
        db.getBootstrap(),
        db.getLastRelease()
    ]);

    bootstrap = bootstrap || {};

    if (bootstrap.done) {
        bootstrap.lastPage = null;
    } else {
        lastRelease = null;
        bootstrap.lastPage = bootstrap.lastPage || 1;
    }

    const result = await rarbg.fetchReleases(lastRelease, bootstrap.lastPage);

    if (_.isEmpty(result.releases) || (!result.success && bootstrap.done)) {
        // do nothing
    } else {
        result.bootstrap = {
            done: result.success,
            lastPage: _.max([bootstrap.lastPage, _.maxBy(result.releases, 'page').page])
        };

        await upsertReleases(result.releases);

        if (!bootstrap.done) {
            await db.upsertBootstrap(result.bootstrap);
        }
    }
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
            release.episode = parsed.episode;
        }

        if (!release.imdbId || !parsed) {
            release.isVerified = false;
        }

        await db.upsertRelease(release);
    }
}

// **************************************************
// set releases magnet link
// **************************************************
async function setReleasesMagnetLink() {
    debug('set releases magnet link...');

    const rarbg = providers.rarbg;
    const releases = await db.getReleasesWithoutMagnetLink();

    try { await rarbg.fetchMagnet(releases); } catch (err) {}

    for (const release of releases) {
        if (release.magnet) {
            const r = {
                _id: release._id,
                magnet: release.magnet
            };

            await db.upsertRelease(r);
        } else if (release.noSuchTorrent) {
            await db.removeRelease(r);
        }
    }
}

// **************************************************
// verify releases
// **************************************************
async function verifyReleases() {
    debug('verifying releases...');

    const releases = await db.getReleasesToVerify();

    for (const release of releases) {
        if (release.type == 'movie') {
            await verifyMovie(release);
        } else {
            await verifyShow(release);
        }
    }
}

async function verifyMovie(release) {
    const imdb = providers.imdb;

    let imdbInfo = imdbList.get(release.imdbId);

    if (!imdbInfo) imdbInfo = await imdb.fetch(release.imdbId, release.type);
    if (!imdbInfo) return;

    let validated = false;

    if (!imdbInfo.titleParent) {
        const parsed = oleoo.parse(release.name, { strict: true });

        // Movie Title check
        const releaseTitle = parsed.title.replace(/-/g, '.').replace(/ /g, '.').toUpperCase(); // fix: replace allowed character '-' with dot - some releases replace with dot
        let movieTitleEncoded = common.scene.titleEncode(imdbInfo.title).toUpperCase(); // encode imdb movie title

        if (movieTitleEncoded !== '' && (releaseTitle.indexOf(movieTitleEncoded) !== -1 || movieTitleEncoded.indexOf(releaseTitle) !== -1)) { // compare movie title
            validated = true;
        } else {
            if (imdbInfo.akas) {
                imdbInfo.akas.some(function(aka) {
                    movieTitleEncoded = common.scene.titleEncode(aka).toUpperCase();

                    if (movieTitleEncoded !== '' && (releaseTitle.indexOf(movieTitleEncoded) !== -1 || movieTitleEncoded.indexOf(releaseTitle) !== -1)) { // compare aka movie title
                        imdbInfo.aka = aka;
                        validated = true;
                        return true;
                    }

                    return false;
                });
            }
        }

        // Year && Type check
        validated = validated && (imdbInfo.year == parseInt(parsed.year));

        const pubdateProperty = 'pubdate' + release.quality;

        if (release[pubdateProperty] == null) {
            imdbInfo[pubdateProperty] = release.pubdate;
        }

        await db.upsertIMDb(imdbInfo);
    }

    imdbList.add(imdbInfo);

    const r = {
        _id: release._id,
        imdbId: imdbInfo._id, // because of imdb redirects, initial imdbId could not be the final one)
        isVerified: validated
    };

    await db.upsertRelease(r);
}

async function verifyShow(release) {
    const imdb = providers.imdb;

    let imdbInfo = imdbList.get(release.imdbId);

    if (!imdbInfo) imdbInfo = await imdb.fetch(release.imdbId, release.type);
    if (!imdbInfo) return;

    let validated = false;

    if (!imdbInfo.titleParent) {
        const pubdateProperty = 'pubdate' + release.quality;
        let isNewEpisode;

        if (release[pubdateProperty] == null) {
            isNewEpisode = true;
        } else {
            const lastEpisode = await db.getLastEpisode(imdbInfo._id, release.quality);
            isNewEpisode = (release.season > lastEpisode.season) || (release.season == lastEpisode.season && _.max(release.episode) > lastEpisode.episode);
        }

        validated = true;

        if (isNewEpisode) {
            imdbInfo[pubdateProperty] = release.pubdate;
        }

        await db.upsertIMDb(imdbInfo);
    }

    imdbList.add(imdbInfo);

    const r = {
        _id: release._id,
        imdbId: imdbInfo._id, // because of imdb redirects, initial imdbId could not be the final one)
        isVerified: validated
    };

    await db.upsertRelease(r);
}

// **************************************************
// database maintenance
// **************************************************
async function refreshReleaseOutdated() {
    debug('refreshing Releases data...');

    const rarbg = providers.rarbg;
    const release = await db.getReleaseOutdated();

    if (release) {
        try { await rarbg.fetchMagnet([release]); } catch (err) {}

        if (release.magnet) {
            const r = {
                _id: release._id,
                magnet: release.magnet
            };

            await db.upsertRelease(r);
        } else if (release.noSuchTorrent) {
            await db.removeRelease(r);
        }
    }
}

async function refreshIMDbOutdated() {
    debug('refreshing IMDb data...');

    const imdb = providers.imdb;
    const doc = await db.getIMDbOutdated();

    if (doc) {
        const imdbInfo = await imdb.fetch(doc._id, doc.type);
        imdbInfo && await db.upsertIMDb(imdbInfo);
    }
}

module.exports = Core;