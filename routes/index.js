'use strict';

const _ = require('lodash');

function checkAuth(req, res, next) {
    if (!req.session.user_id) {
        req.session.redirectTo = req.originalUrl;
        res.redirect('/login/');
    } else {
        next();
    }
}

async function getLayoutData(req, res, next) {
    const locals = req.app.locals;
    const db = locals.db;

    const total = await db.getReleasesCount();

    locals.countMovieReleases720p = 0;
    locals.countMovieReleases1080p = 0;
    locals.countShowReleases720p = 0;
    locals.countShowReleases1080p = 0;

    locals.countUnverifiedMovieReleases = 0;
    locals.countUnverifiedShows = 0;

    _.each(total, function(subTotal) {
        if (subTotal._id.type == 'movie') {
            if (subTotal._id.quality == '720p') {
                locals.countMovieReleases720p += subTotal.count;
            } else {
                locals.countMovieReleases1080p += subTotal.count;
            }

            if (subTotal._id.isVerified === false) {
                locals.countUnverifiedMovieReleases += subTotal.count;
            }
        } else {
            if (subTotal._id.quality == '720p') {
                locals.countShowReleases720p += subTotal.count;
            } else {
                locals.countShowReleases1080p += subTotal.count;
            }
        }
    });

    locals.countUnverifiedShows = await db.getUnverifiedShowsCount();

    next();
}

module.exports = function(app) {
    // **************************************************
    // login & logout
    // **************************************************
    app.get('/login', function(req, res) {
        if (!req.url.endsWith('/')) {
            req.url += '/';
            res.redirect(req.url);
        } else {
            if (req.session.user_id) {
                res.redirect('/');
            } else {
                res.render('login', {
                    title: 'Login',
                    layout: false,
                    badLogin: false
                });
            }
        }
    });

    app.post('/login', function(req, res) {
        const post = req.body;

        if (post.inputUser === 'admin' && post.inputPassword === req.app.locals.settings.adminPassword) {
            req.session.user_id = post.inputUser;

            const redirectTo = req.session.redirectTo ? req.session.redirectTo : '/';
            delete req.session.redirectTo;

            res.redirect(redirectTo);
        } else {
            res.render('login', {
                title: 'Login',
                layout: false,
                badLogin: true
            });
        }
    });

    app.get('/logout', function(req, res) {
        delete req.session.user_id;
        res.redirect('/');
    });

    // **************************************************
    // status
    // **************************************************
    app.get('(/|/status)', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.url += '/';
            res.redirect(req.url);
        } else {
            const db = req.app.locals.db;

            const memoryUsage = await db.getMemoryUsage();

            res.render('status', {
                title: 'Status',
                isAuthed: !!req.session.user_id,
                memoryUsage: memoryUsage
            });
        }
    });

    app.get('/memory', function(req, res) {
        const data = {
            x: req.app.locals.moment().valueOf(),
            y: process.memoryUsage().rss / 1048576
        }

        res.json(data);
    });

    // **************************************************
    // refresh & stop core
    // **************************************************
    app.use('/core', require('./core.js')(checkAuth));

    // **************************************************
    // releases
    // **************************************************
    app.use('/releases', require('./releases.js')(getLayoutData));

    // **************************************************
    // search
    // **************************************************
    app.use('/search', require('./search.js')(getLayoutData));

    // **************************************************
    // verify movie releases & shows
    // **************************************************
    app.use('/verify', require('./verify.js')(checkAuth, getLayoutData));

    // **************************************************
    // upsert show
    // **************************************************
    app.put('/release', checkAuth, async function(req, res) {
        const db = req.app.locals.db;
        const imdb = req.app.locals.providers.imdb;
        const release = req.body;

        try {
            if (release._id && release.imdbId.match(/^tt\d+$/)) {
                const imdbInfo = await imdb.fetch(release.imdbId, 'movie');
                if (!imdbInfo) throw 'Unable to fetch imdb info.';

                await db.upsertIMDb(imdbInfo);
                await db.upsertRelease({
                    _id: release._id,
                    imdbId: imdbInfo._id, // because of imdb redirects
                    isVerified: true
                });

                res.status(200).send();
            } else {
                res.status(400).send('Invalid data.');
            }
        } catch (err) {
            res.status(500).send(err);
        }
    });

    app.put('/show', checkAuth, async function(req, res) {
        const db = req.app.locals.db;
        const showInfo = req.body;

        try {
            if (showInfo._id && showInfo.folder && (!showInfo.addic7edId || showInfo.addic7edId.match(/^\d+$/))) {
                await db.upsertIMDb({
                    _id: showInfo._id,
                    folder: showInfo.folder,
                    addic7edId: parseInt(showInfo.addic7edId) || 0,
                    isVerified: true
                });

                res.status(200).send();
            } else {
                res.status(400).send('Invalid data.');
            }
        } catch (err) {
            res.status(500).send(err);
        }
    });

    // **************************************************
    // api
    // **************************************************
    app.use('/api', require('./api.js'));

    // **************************************************
    // subtitle download interface
    // **************************************************
    app.get('/subtitle/*', async function(req, res) {
        const common = req.app.locals.common;
        const addic7ed = req.app.locals.providers.addic7ed;
        const subtitle = common.regex(/^\/subtitle\/(.+?)(\/.+)$/i, req.path);

        if (subtitle) {
            const s = await addic7ed.download(subtitle[1]);

            res.attachment(subtitle[0] + '.srt');
            res.send(s);
        } else {
            res.status(400).send('Invalid subtitle.');
        }
    });

    // **************************************************
    // catch 404 and forward to error handler
    // **************************************************
    app.use(function(req, res) {
        res.status(400);
        res.render('error', {
            message: 'Stop being a smartass!',
            layout: false
        });
    });
};