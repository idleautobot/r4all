'use strict';

const debug = require('debug')('DB');
const Promise = require('bluebird');
const MongoDB = Promise.promisifyAll(require('mongodb'));

const settings = require('./settings.js');

let db = null;

async function databaseHandler(...args) {
    const method = args.shift();

    if (db === null) await database.init();
    if (method == 'init') return;

    return await database[method](...args);
};

const database = {
    // **************************************************
    // initialize
    // **************************************************
    init: async function() {
        debug('connecting to the db...');

        const client = await MongoDB.MongoClient.connectAsync('mongodb://' + settings.MONGODB_USER + ':' + settings.MONGODB_PASSWORD + '@' + settings.MONGODB_SERVICE_HOST + ':' + settings.MONGODB_SERVICE_PORT + '/' + settings.MONGODB_DATABASE, { useNewUrlParser: true })
        db = client.db(settings.MONGODB_DATABASE);

        db.on('close', function() {
            db = null;
        });

        debug('connected');
    },

    // **************************************************
    // get
    // **************************************************
    getBootstrap: async function() {
        return await db.collection('bootstrap').findOneAsync({ _id: 1 });
    },

    getLastRelease: async function() {
        return await db.collection('releases').find().project({ _id: 0, name: 1, pubdate: 1 }).sort({ pubdate: -1 }).limit(1).nextAsync();
    },

    getReleasesWithoutMagnetLink: async function() {
        return await db.collection('releases').aggregate([{
            $match: { magnet: null }
        }, {
            $sort: { pubdate: 1 }
        }, {
            $project: { tid: 1 }
        }]).toArrayAsync();
    },

    getReleasesToVerify: async function() {
        return await db.collection('releases').aggregate([{
            $match: { isVerified: null, magnet: { $ne: null } }
        }, {
            $sort: { pubdate: 1 }
        }, {
            $lookup: {
                from: 'imdb',
                localField: 'imdbId',
                foreignField: '_id',
                as: 'imdb'
            }
        }, {
            $unwind: {
                path: '$imdb',
                preserveNullAndEmptyArrays: true
            }
        }, {
            $project: {
                name: 1,
                pubdate: 1,
                imdbId: 1,
                type: 1,
                quality: 1,
                season: 1,
                episode: 1,
                pubdate720p: '$imdb.pubdate720p',
                pubdate1080p: '$imdb.pubdate1080p'
            }
        }]).toArrayAsync();
    },

    getLastEpisode: async function(imdbId, quality) {
        const lastEpisode = await db.collection('releases').aggregate([{
            $match: { imdbId: imdbId, quality: quality, isVerified: true }
        }, {
            $unwind: {
                path: '$episode'
            }
        }, {
            $sort: { 'season': -1, 'episode': -1, 'pubdate': 1 }
        }, {
            $limit: 1
        }, {
            $project: {
                season: 1,
                episode: 1
            }
        }]).toArrayAsync();

        return lastEpisode[0];
    },

    // getReleaseSubtitle: async function(releaseId) {
    //     return await db.collection('releases').aggregateAsync([{
    //             $match: { _id: releaseId }
    //         }, {
    //             $lookup: {
    //                 from: 'imdb',
    //                 localField: 'imdbId',
    //                 foreignField: '_id',
    //                 as: 'imdb'
    //             }
    //         }, {
    //             $unwind: {
    //                 path: '$imdb'
    //             }
    //         }, {
    //             $limit: 1
    //         }])
    //         .then(function(docs) {
    //             return docs[0];
    //         });
    // },

    // **************************************************
    // get - dashboard
    // **************************************************
    getReleasesCount: async function() {
        return await db.collection('releases').aggregate({
            $group: {
                _id: {
                    type: '$type',
                    quality: '$quality',
                    isVerified: '$isVerified'
                },
                count: { $sum: 1 }
            }
        }, {
            $project: {
                _id: 1,
                count: 1
            }
        }).toArrayAsync();
    },

    getUnverifiedShowsCount: async function() {
        return await db.collection('imdb').countDocumentsAsync({ type: 'show', isVerified: false });
    },

    getReleases: async function(view, page, param) {
        var match;

        page = page || 1;

        var pipeline = [{
            $sort: { pubdate: -1 }
        }, {
            $skip: (page - 1) * settings.dashboardPageRecords
        }, {
            $limit: settings.dashboardPageRecords + 1
        }, {
            $lookup: {
                from: 'imdb',
                localField: 'imdbId',
                foreignField: '_id',
                as: 'imdb'
            }
        }, {
            $unwind: {
                path: '$imdb',
                preserveNullAndEmptyArrays: true
            }
        }, {
            $project: {
                name: 1,
                type: 1,
                quality: 1,
                pubdate: 1,
                imdbId: 1,
                isVerified: 1,
                tid: 1,
                magnet: 1,
                subtitleId: 1,
                'imdb.title': 1,
                'imdb.aka': 1,
                'imdb.type': 1,
                'imdb.numSeasons': 1,
                'imdb.year': 1,
                'imdb.plot': 1,
                'imdb.genres': 1,
                'imdb.runtime': 1,
                'imdb.rating': 1,
                'imdb.votes': 1,
                'imdb.cover': 1,
                'imdb.trailer': 1,
                'imdb.state': 1,
                'imdb.addic7edId': 1
            }
        }];

        switch (view) {
            case 'releases':
                break;
            case 'movies':
                match = { $match: { type: 'movie' } };
                break;
            case 'movies-720p':
                match = { $match: { type: 'movie', quality: '720p' } };
                break;
            case 'movies-1080p':
                match = { $match: { type: 'movie', quality: '1080p' } };
                break;
            case 'tv-shows':
                match = { $match: { type: 'show' } };
                break;
            case 'tv-shows-720p':
                match = { $match: { type: 'show', quality: '720p' } };
                break;
            case 'tv-shows-1080p':
                match = { $match: { type: 'show', quality: '1080p' } };
                break;
            case 'imdb':
                match = { $match: { imdbId: param } };
                break;
            case 'search':
                const r = new RegExp('.*' + param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*', 'i');
                match = { $match: { name: { $regex: r } } };
                break;
            default:
                break;
        }

        match && pipeline.unshift(match);

        return await db.collection('releases').aggregate(pipeline).toArrayAsync();
    },

    getUnverifiedMovies: async function() {
        return await db.collection('releases').find({
            type: 'movie',
            isVerified: false
        }, {
            name: 1,
            imdbId: 1
        }).sort({ name: 1 }).toArrayAsync();
    },

    getUnverifiedShows: async function() {
        return await db.collection('imdb').find({
            type: 'show',
            isVerified: false
        }, {
            title: 1,
            year: 1,
            folder: 1,
            addic7edId: 1
        }).sort({ title: 1 }).toArrayAsync();
    },

    // **************************************************
    // upsert
    // **************************************************
    upsertBootstrap: async function(bootstrap) {
        bootstrap._id = 1;
        await db.collection('bootstrap').updateOneAsync({ _id: bootstrap._id }, { $set: bootstrap }, { upsert: true });
    },

    upsertRelease: async function(release) {
        delete release.page;
        await db.collection('releases').updateOneAsync({ _id: release._id }, { $set: release, $currentDate: { updatedOn: true } }, { upsert: true });
    },

    upsertIMDb: async function(imdbInfo) {
        const akas = imdbInfo.akas;
        delete imdbInfo.akas;
        await db.collection('imdb').updateOneAsync({ _id: imdbInfo._id }, { $set: imdbInfo, $currentDate: { updatedOn: true } }, { upsert: true });
        imdbInfo.akas = akas;
    },

    // **************************************************
    // remove
    // **************************************************
    removeRelease: async function(release) {
        await db.collection('releases').removeAsync({ _id: release._id });
    },

    // **************************************************
    // database maintenance
    // **************************************************
    getReleaseOutdated: async function() {
        const docs = await db.collection('releases').aggregate([
            { $match: { magnet: { $ne: null } } },
            { $sort: { updatedOn: 1 } },
            { $limit: 1 },
            { $project: { tid: 1 } }
        ]).toArrayAsync();

        return docs[0];
    },

    getIMDbOutdated: async function() {
        const docs = await db.collection('imdb').aggregate([
            { $sort: { updatedOn: 1 } },
            { $limit: 1 },
            { $project: { _id: 1, type: 1 } }
        ]).toArrayAsync();

        return docs[0];
    },

    // **************************************************
    // memory
    // **************************************************
    insertMemoryUsage: async function(data) {
        await db.collection('memory').insertOneAsync(data);
    },

    getMemoryUsage: async function() {
        return await db.collection('memory').aggregate([{
            $sort: { date: 1 }
        }, {
            $project: {
                _id: 0,
                x: { $subtract: ['$date', new Date('1970-01-01')] },
                y: { $divide: ['$rss', 1048576] }
            }
        }]).toArrayAsync();
    },

    // **************************************************
    // api
    // **************************************************
    getFeed: async function(filters) {
        let movieQualityFilter, showQualityFilter, moviePubdateProjection, showPubdateProjection;

        let feedFrom = new Date(filters.from);
        feedFrom = (!isNaN(feedFrom) && feedFrom) || new Date('1970-01-01');

        if (filters.mquality === '1080p') {
            movieQualityFilter = { pubdate720p: { $gt: feedFrom } };
            moviePubdateProjection = '$pubdate1080p';
        } else {
            movieQualityFilter = { pubdate1080p: { $gt: feedFrom } };
            moviePubdateProjection = '$pubdate720p';
        }

        if (filters.mquality === '1080p') {
            showQualityFilter = { pubdate720p: { $gt: feedFrom } };
            showPubdateProjection = '$pubdate1080p';
        } else {
            showQualityFilter = { pubdate1080p: { $gt: feedFrom } };
            showPubdateProjection = '$pubdate720p';
        }

        return await db.collection('imdb').aggregate({
            $match: {
                $or: [{
                    $and: [{ type: 'movie' }, movieQualityFilter]
                }, {
                    $and: [{ type: 'show' }, showQualityFilter]
                }]
            }
        }, {
            $project: {
                title: 1,
                type: 1,
                pubdate: {
                    $cond: [{ $eq: ["$type", 'movie'] }, moviePubdateProjection, showPubdateProjection]
                }
            }
        }, {
            $sort: {
                pubdate: 1
            }
        }).toArrayAsync();
    },

    // getAppView: function(filters) {
    //     switch (filters.view) {
    //         case 'feedView':
    //             return this.getAppFeedView(filters);
    //         case 'moviesView':
    //         case 'showsView':
    //             return this.getAppReleasesView(filters);
    //         case 'imdbView':
    //             return this.getAppIMDbView(filters);
    //         case 'detail':
    //             return this.getAppDetail(filters);
    //         default:
    //             return Promise.resolve([]);
    //     }
    // },

    // getAppFeedView: function(filters) {
    //     var pipeline = [];

    //     // from
    //     filters.from = parseInt(filters.from);
    //     filters.from = new Date(filters.from ? filters.from : '1970-01-01');

    //     pipeline.push({ $match: { verifiedOn: { $gt: filters.from } } });

    //     // category
    //     if (filters.quality && (filters.quality == '720p' || filters.quality == '1080p')) {
    //         pipeline.push({ $match: { $or: [{ category: 'm' + filters.quality }, { category: 's720p' }] } });
    //     }

    //     // page
    //     filters.page = filters.page > 1 ? filters.page : 1;

    //     // remaining pipeline
    //     pipeline.push({
    //         $sort: { date: 1 }
    //     }, {
    //         $skip: (filters.page - 1) * settings.appPageRecords
    //     }, {
    //         $limit: settings.appPageRecords
    //     }, {
    //         $lookup: {
    //             from: 'imdb',
    //             localField: 'imdbId',
    //             foreignField: '_id',
    //             as: 'imdb'
    //         }
    //     }, {
    //         $unwind: '$imdb'
    //     }, {
    //         $project: {
    //             name: 1,
    //             parsed: 1,
    //             category: 1,
    //             imdbId: 1,
    //             verifiedOn: 1,
    //             magnetLink: 1,
    //             subtitleId: 1,
    //             title: '$imdb.title',
    //             type: '$imdb.type',
    //             numSeasons: '$imdb.numSeasons',
    //             year: '$imdb.year',
    //             rating: '$imdb.rating',
    //             votes: '$imdb.votes',
    //             cover: '$imdb.cover'
    //         }
    //     });

    //     return db.collection('releases').aggregateAsync(pipeline);
    // },

    // getAppReleasesView: function(filters) {
    //     var pipeline = [];

    //     // filter by user collection
    //     if (filters.ids) {
    //         filters.ids = [].concat(filters.ids);

    //         if (filters.nin) {
    //             pipeline.push({ $match: { _id: { $nin: filters.ids } } });
    //         } else {
    //             pipeline.push({ $match: { _id: { $in: filters.ids } } });
    //         }
    //     }

    //     // category
    //     if (filters.view == 'moviesView') {
    //         if (filters.quality && (filters.quality == '720p' || filters.quality == '1080p')) {
    //             pipeline.push({ $match: { category: 'm' + filters.quality } });
    //         } else if (filters.nin) {
    //             pipeline.push({ $match: { $or: [{ category: 'm720p' }, { category: 'm1080p' }] } });
    //         }
    //     } else if (filters.nin) { // shows
    //         pipeline.push({ $match: { category: 's720p' } });
    //     }

    //     // isVerified
    //     pipeline.push({ $match: { isVerified: 1 } });

    //     //search
    //     if (filters.s) {
    //         var r = new RegExp(filters.s, 'i');
    //         pipeline.push({ $match: { name: { $regex: r } } });
    //     }

    //     // imdb join on imdb filter && sorter
    //     if (filters.genre || filters.sorter == 'votes' || filters.sorter == 'rating' || filters.sorter == 'year') {
    //         pipeline.push({
    //             $lookup: {
    //                 from: 'imdb',
    //                 localField: 'imdbId',
    //                 foreignField: '_id',
    //                 as: 'imdb'
    //             }
    //         }, {
    //             $unwind: '$imdb'
    //         });
    //     }

    //     // genre
    //     if (filters.genre) {
    //         pipeline.push({ $match: { 'imdb.genres': { $elemMatch: { $eq: filters.genre } } } });
    //     }

    //     // sort & order
    //     filters.order = filters.order == 1 ? 1 : -1;

    //     switch (filters.sorter) {
    //         case 'name':
    //             pipeline.push({
    //                 $project: {
    //                     name: 1,
    //                     insensitive: { $toLower: '$name' },
    //                     parsed: 1,
    //                     category: 1,
    //                     imdbId: 1,
    //                     verifiedOn: 1,
    //                     magnetLink: 1,
    //                     imdb: 1
    //                 }
    //             });
    //             pipeline.push({ $sort: { insensitive: filters.order } });
    //             break;
    //         case 'updated':
    //             break;
    //         case 'votes':
    //             pipeline.push({ $sort: { 'imdb.votes': filters.order } });
    //             break;
    //         case 'rating':
    //             pipeline.push({ $sort: { 'imdb.rating': filters.order } });
    //             break;
    //         case 'year':
    //             pipeline.push({ $sort: { 'imdb.year': filters.order } });
    //             break;
    //         case 'posted':
    //         default:
    //             pipeline.push({ $sort: { date: filters.order } });
    //             break;
    //     }

    //     // remaining pipeline
    //     if (filters.sorter != 'updated') {
    //         // page
    //         filters.page = filters.page > 1 ? filters.page : 1;

    //         pipeline.push({
    //             $skip: (filters.page - 1) * settings.appPageRecords
    //         }, {
    //             $limit: settings.appPageRecords
    //         });
    //     }

    //     // imdb join
    //     if (!(filters.genre || filters.sorter == 'votes' || filters.sorter == 'rating' || filters.sorter == 'year')) {
    //         pipeline.push({
    //             $lookup: {
    //                 from: 'imdb',
    //                 localField: 'imdbId',
    //                 foreignField: '_id',
    //                 as: 'imdb'
    //             }
    //         }, {
    //             $unwind: '$imdb'
    //         });
    //     }

    //     // final projection
    //     pipeline.push({
    //         $project: {
    //             name: 1,
    //             parsed: 1,
    //             category: 1,
    //             imdbId: 1,
    //             verifiedOn: 1,
    //             magnetLink: 1,
    //             title: '$imdb.title',
    //             type: '$imdb.type',
    //             numSeasons: '$imdb.numSeasons',
    //             year: '$imdb.year',
    //             rating: '$imdb.rating',
    //             votes: '$imdb.votes',
    //             cover: '$imdb.cover'
    //         }
    //     });

    //     return db.collection('releases').aggregateAsync(pipeline);
    // },

    // getAppIMDbView: function(filters) {
    //     var pipeline = [];

    //     // filter by user collection
    //     if (filters.ids) {
    //         filters.ids = [].concat(filters.ids);
    //         pipeline.push({ $match: { _id: { $in: filters.ids } } });
    //     }

    //     //search
    //     if (filters.s) {
    //         var r = new RegExp(filters.s, 'i');
    //         pipeline.push({ $match: { title: { $regex: r } } });
    //     }

    //     // genre
    //     if (filters.genre) {
    //         pipeline.push({ $match: { genres: { $elemMatch: { $eq: filters.genre } } } });
    //     }

    //     // sort & order
    //     filters.order = filters.order == 1 ? 1 : -1;

    //     switch (filters.sorter) {
    //         case 'votes':
    //             pipeline.push({ $sort: { votes: filters.order } });
    //             break;
    //         case 'rating':
    //             pipeline.push({ $sort: { rating: filters.order } });
    //             break;
    //         case 'year':
    //             pipeline.push({ $sort: { year: filters.order } });
    //             break;
    //         case 'title':
    //         default:
    //             pipeline.push({
    //                 $project: {
    //                     title: 1,
    //                     insensitive: { $toLower: '$title' },
    //                     type: 1,
    //                     numSeasons: 1,
    //                     year: 1,
    //                     rating: 1,
    //                     votes: 1,
    //                     cover: 1
    //                 }
    //             });
    //             pipeline.push({ $sort: { insensitive: filters.order } });
    //             break;
    //     }

    //     // page
    //     filters.page = filters.page > 1 ? filters.page : 1;

    //     // remaining pipeline
    //     pipeline.push({
    //         $skip: (filters.page - 1) * settings.appPageRecords
    //     }, {
    //         $limit: settings.appPageRecords
    //     }, {
    //         $project: {
    //             title: 1,
    //             type: 1,
    //             numSeasons: 1,
    //             year: 1,
    //             rating: 1,
    //             votes: 1,
    //             cover: 1
    //         }
    //     });

    //     return db.collection('imdb').aggregateAsync(pipeline);
    // },

    // getAppDetail: function(filters) {
    //     var collection, pipeline = [];
    //     var isIMDb = filters._id.match(/^tt\d+$/) !== null;

    //     pipeline.push({ $match: { _id: filters._id } });

    //     // releases join
    //     pipeline.push({
    //         $lookup: {
    //             from: 'releases',
    //             localField: isIMDb ? '_id' : 'imdbId',
    //             foreignField: 'imdbId',
    //             as: 'releases'
    //         }
    //     });

    //     if (isIMDb) {
    //         collection = db.collection('imdb');

    //         // filter && projection
    //         pipeline.push({
    //             $project: {
    //                 title: 1,
    //                 aka: 1,
    //                 type: 1,
    //                 numSeasons: 1,
    //                 year: 1,
    //                 plot: 1,
    //                 genres: 1,
    //                 runtime: 1,
    //                 rating: 1,
    //                 votes: 1,
    //                 cover: 1,
    //                 backdrop: 1,
    //                 trailer: 1,
    //                 state: 1,
    //                 episodes: 1,
    //                 releases: {
    //                     $filter: {
    //                         input: '$releases',
    //                         as: 'release',
    //                         cond: {
    //                             $and: [{
    //                                 $eq: ['$$release.isVerified', 1]
    //                             }, {
    //                                 $or: [
    //                                     typeof filters.quality === 'undefined',
    //                                     { $eq: ['$$release.category', 'm' + filters.quality] }
    //                                 ]
    //                             }]
    //                         }
    //                     }
    //                 }
    //             }
    //         }, {
    //             $project: {
    //                 title: 1,
    //                 aka: 1,
    //                 type: 1,
    //                 numSeasons: 1,
    //                 year: 1,
    //                 plot: 1,
    //                 genres: 1,
    //                 runtime: 1,
    //                 rating: 1,
    //                 votes: 1,
    //                 cover: 1,
    //                 backdrop: 1,
    //                 trailer: 1,
    //                 state: 1,
    //                 episodes: 1,
    //                 'releases._id': 1,
    //                 'releases.name': 1,
    //                 'releases.parsed': 1,
    //                 'releases.category': 1,
    //                 'releases.date': 1,
    //                 'releases.imdbId': 1,
    //                 'releases.verifiedOn': 1,
    //                 'releases.magnetLink': 1,
    //                 'releases.subtitleId': 1
    //             }
    //         });
    //     } else {
    //         collection = db.collection('releases');

    //         // imdb join for release detail
    //         pipeline.push({
    //             $lookup: {
    //                 from: 'imdb',
    //                 localField: 'imdbId',
    //                 foreignField: '_id',
    //                 as: 'imdb'
    //             }
    //         }, {
    //             $unwind: '$imdb'
    //         });

    //         if (filters.type == 'show') {
    //             pipeline.push({
    //                 $lookup: {
    //                     from: 'shows',
    //                     localField: 'showId',
    //                     foreignField: '_id',
    //                     as: 'show'
    //                 }
    //             }, {
    //                 $unwind: '$show'
    //             });
    //         }

    //         // filter && projection
    //         pipeline.push({
    //             $project: {
    //                 name: 1,
    //                 parsed: 1,
    //                 category: 1,
    //                 date: 1,
    //                 imdbId: 1,
    //                 nfo: 1,
    //                 ddlvalley: 1,
    //                 rlsbb: 1,
    //                 twoddl: 1,
    //                 verifiedOn: 1,
    //                 magnetLink: 1,
    //                 show: 1,
    //                 imdb: 1,
    //                 releases: {
    //                     $filter: {
    //                         input: '$releases',
    //                         as: 'release',
    //                         cond: {
    //                             $and: [{
    //                                 $eq: ['$$release.isVerified', 1]
    //                             }, {
    //                                 $ne: ['$$release._id', '$_id']
    //                             }, {
    //                                 $or: [
    //                                     typeof filters.quality === 'undefined',
    //                                     { $eq: ['$$release.category', 'm' + filters.quality] }
    //                                 ]
    //                             }, {
    //                                 $or: [{
    //                                     $eq: ['$imdb.type', 'movie']
    //                                 }, {
    //                                     $and: [{
    //                                         $eq: ['$parsed.season', '$$release.parsed.season']
    //                                     }, {
    //                                         $setIsSubset: ['$parsed.episodes', '$$release.parsed.episodes']
    //                                     }]
    //                                 }]
    //                             }]
    //                         }
    //                     }
    //                 }
    //             }
    //         }, {
    //             $project: {
    //                 name: 1,
    //                 parsed: 1,
    //                 category: 1,
    //                 date: 1,
    //                 imdbId: 1,
    //                 nfo: 1,
    //                 ddlvalley: 1,
    //                 rlsbb: 1,
    //                 twoddl: 1,
    //                 magnetLink: 1,
    //                 addic7edId: '$show.addic7edId',
    //                 title: '$imdb.title',
    //                 aka: '$imdb.aka',
    //                 type: '$imdb.type',
    //                 numSeasons: '$imdb.numSeasons',
    //                 year: '$imdb.year',
    //                 plot: '$imdb.plot',
    //                 genres: '$imdb.genres',
    //                 runtime: '$imdb.runtime',
    //                 rating: '$imdb.rating',
    //                 votes: '$imdb.votes',
    //                 cover: '$imdb.cover',
    //                 backdrop: '$imdb.backdrop',
    //                 trailer: '$imdb.trailer',
    //                 state: '$imdb.state',
    //                 episodes: '$imdb.episodes',
    //                 'releases._id': 1,
    //                 'releases.name': 1,
    //                 'releases.parsed': 1,
    //                 'releases.category': 1,
    //                 'releases.date': 1,
    //                 'releases.imdbId': 1,
    //                 'releases.verifiedOn': 1,
    //                 'releases.magnetLink': 1,
    //                 'releases.subtitleId': 1
    //             }
    //         });
    //     }

    //     return collection.aggregateAsync(pipeline);
    // },
};

module.exports = {
    // **************************************************
    // init
    // **************************************************
    init: async function(...args) {
        return await databaseHandler(this.getBootstrap.name, ...args);
    },

    // **************************************************
    // get
    // **************************************************
    getBootstrap: async function(...args) {
        return await databaseHandler(this.getBootstrap.name, ...args);
    },

    getLastRelease: async function(...args) {
        return await databaseHandler(this.getLastRelease.name, ...args);
    },

    getReleasesWithoutMagnetLink: async function(...args) {
        return await databaseHandler(this.getReleasesWithoutMagnetLink.name, ...args);
    },

    getReleasesToVerify: async function(...args) {
        return await databaseHandler(this.getReleasesToVerify.name, ...args);
    },

    getLastEpisode: async function(...args) {
        return await databaseHandler(this.getLastEpisode.name, ...args);
    },

    // **************************************************
    // get - dashboard
    // **************************************************
    getReleasesCount: async function(...args) {
        return await databaseHandler(this.getReleasesCount.name, ...args);
    },

    getUnverifiedShowsCount: async function(...args) {
        return await databaseHandler(this.getUnverifiedShowsCount.name, ...args);
    },

    getReleases: async function(...args) {
        return await databaseHandler(this.getReleases.name, ...args);
    },

    getUnverifiedMovies: async function(...args) {
        return await databaseHandler(this.getUnverifiedMovies.name, ...args);
    },

    getUnverifiedShows: async function(...args) {
        return await databaseHandler(this.getUnverifiedShows.name, ...args);
    },

    // **************************************************
    // upsert
    // **************************************************
    upsertBootstrap: async function(...args) {
        return await databaseHandler(this.upsertBootstrap.name, ...args);
    },

    upsertRelease: async function(...args) {
        return await databaseHandler(this.upsertRelease.name, ...args);
    },

    upsertIMDb: async function(...args) {
        return await databaseHandler(this.upsertIMDb.name, ...args);
    },

    // **************************************************
    // remove
    // **************************************************
    removeRelease: async function(...args) {
        return await databaseHandler(this.removeRelease.name, ...args);
    },

    // **************************************************
    // database maintenance
    // **************************************************
    getReleaseOutdated: async function(...args) {
        return await databaseHandler(this.getReleaseOutdated.name, ...args);
    },

    getIMDbOutdated: async function(...args) {
        return await databaseHandler(this.getIMDbOutdated.name, ...args);
    },

    // **************************************************
    // memory
    // **************************************************
    insertMemoryUsage: async function(...args) {
        return await databaseHandler(this.insertMemoryUsage.name, ...args);
    },

    getMemoryUsage: async function(...args) {
        return await databaseHandler(this.getMemoryUsage.name, ...args);
    },

    // **************************************************
    // api
    // **************************************************
    getFeed: async function(...args) {
        return await databaseHandler(this.getFeed.name, ...args);
    },

    // **************************************************
    // status
    // **************************************************
    isOn: function() {
        return db !== null;
    }
};