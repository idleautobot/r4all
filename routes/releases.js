'use strict';

const express = require('express');
const router = express.Router();

var categories = {
    'movies': 'Movie Releases',
    'movies-720p': '720p Movie Releases',
    'movies-1080p': '1080p Movie Releases',
    'tv-shows': 'TV Show Releases',
    'tv-shows-720p': '720p TV Show Releases',
    'tv-shows-1080p': '1080p TV Show Releases'
};

module.exports = function(getLayoutData) {
    router.get('/', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;

            const releases = await db.getReleases('releases');

            res.render('releases', {
                title: 'Releases',
                isAuthed: !!req.session.user_id,
                path: '/releases',
                page: 1,
                releases: releases
            });
        }
    });

    router.get('/page/:page', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const page = req.params.page;

            const releases = await db.getReleases('releases', page);

            res.render('releases', {
                title: 'Releases',
                isAuthed: !!req.session.user_id,
                path: '/releases',
                page: page,
                releases: releases,
            });
        }
    });

    router.get('/category/:category', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const category = req.params.category;

            const releases = await db.getReleases(category);

            res.render('releases', {
                title: categories[category] ? categories[category] : 'Releases',
                isAuthed: !!req.session.user_id,
                path: '/releases/category/' + category,
                page: 1,
                releases: releases
            });
        }
    });

    router.get('/category/:category/page/:page', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const category = req.params.category;
            const page = req.params.page;

            const releases = await db.getReleases(category, page);

            res.render('releases', {
                title: categories[category] ? categories[category] : 'Releases',
                isAuthed: !!req.session.user_id,
                path: '/releases/category/' + category,
                page: page,
                releases: releases
            });
        }
    });

    router.get('/imdb/:imdb', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const title_id = req.params.imdb;

            const releases = await db.getReleases('imdb', 1, title_id);

            res.render('releases', {
                title: 'IMDb Search',
                isAuthed: !!req.session.user_id,
                path: '/releases/imdb/' + title_id,
                page: 1,
                releases: releases
            });
        }
    });

    router.get('/imdb/:imdb/page/:page', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const title_id = req.params.imdb;
            const page = req.params.page;

            const releases = await db.getReleases('imdb', page, title_id);

            res.render('releases', {
                title: 'IMDb Search',
                isAuthed: !!req.session.user_id,
                path: '/releases/imdb/' + title_id,
                page: page,
                releases: releases
            });
        }
    });

    router.get('/show/:show', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const show = req.params.show;

            const releases = await db.getReleases('show', 1, show);

            res.render('releases', {
                title: 'Show Search',
                isAuthed: !!req.session.user_id,
                path: '/releases/show/' + show,
                page: 1,
                releases: releases
            });
        }
    });

    router.get('/show/:show/page/:page', getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;
            const show = req.params.show;
            const page = req.params.page;

            const releases = await db.getReleases('show', page, show);

            res.render('releases', {
                title: 'Show Search',
                isAuthed: !!req.session.user_id,
                path: '/releases/show/' + show,
                page: page,
                releases: releases
            });
        }
    });

    return router;
};