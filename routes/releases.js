'use strict';

var express = require('express');
var _ = require('lodash');
var router = express.Router();

var categories = {
    'movies': 'Movie Releases',
    'movies-720p': '720p Movie Releases',
    'movies-1080p': '1080p Movie Releases',
    'tv-shows': 'TV Show Releases',
    'tv-shows-720p': '720p TV Show Releases',
    'tv-shows-1080p': '1080p TV Show Releases'
};

module.exports = function(getLayoutData) {
    router.get('/', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;

            db.getReleases('releases')
                .then(function(releases) {
                    res.render('releases', {
                        title: 'Releases',
                        isAuthed: !!req.session.user_id,
                        path: '/releases',
                        page: 1,
                        releases: releases
                    });
                });
        }
    });

    router.get('/page/:page', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var page = req.params.page;

            db.getReleases('releases', page)
                .then(function(releases) {
                    res.render('releases', {
                        title: 'Releases',
                        isAuthed: !!req.session.user_id,
                        path: '/releases',
                        page: page,
                        releases: releases,
                    });
                });
        }
    });

    router.get('/category/:category', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var category = req.params.category;

            db.getReleases(category)
                .then(function(releases) {
                    res.render('releases', {
                        title: categories[category] ? categories[category] : 'Releases',
                        isAuthed: !!req.session.user_id,
                        path: '/releases/category/' + category,
                        page: 1,
                        releases: releases
                    });
                });
        }
    });

    router.get('/category/:category/page/:page', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var category = req.params.category;
            var page = req.params.page;

            db.getReleases(category, page)
                .then(function(releases) {
                    res.render('releases', {
                        title: categories[category] ? categories[category] : 'Releases',
                        isAuthed: !!req.session.user_id,
                        path: '/releases/category/' + category,
                        page: page,
                        releases: releases
                    });
                });
        }
    });

    router.get('/imdb/:imdb', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var title_id = req.params.imdb;

            db.getReleases('imdb', 1, title_id)
                .then(function(releases) {
                    res.render('releases', {
                        title: 'IMDb Search',
                        isAuthed: !!req.session.user_id,
                        path: '/releases/imdb/' + title_id,
                        page: 1,
                        releases: releases
                    });
                });
        }
    });

    router.get('/imdb/:imdb/page/:page', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var title_id = req.params.imdb;
            var page = req.params.page;

            db.getReleases('imdb', page, title_id)
                .then(function(releases) {
                    res.render('releases', {
                        title: 'IMDb Search',
                        isAuthed: !!req.session.user_id,
                        path: '/releases/imdb/' + title_id,
                        page: page,
                        releases: releases
                    });
                });
        }
    });

    router.get('/show/:show', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var show = req.params.show;

            db.getReleases('show', 1, show)
                .then(function(releases) {
                    res.render('releases', {
                        title: 'Show Search',
                        isAuthed: !!req.session.user_id,
                        path: '/releases/show/' + show,
                        page: 1,
                        releases: releases
                    });
                });
        }
    });

    router.get('/show/:show/page/:page', getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;
            var show = req.params.show;
            var page = req.params.page;

            db.getReleases('show', page, show)
                .then(function(releases) {
                    res.render('releases', {
                        title: 'Show Search',
                        isAuthed: !!req.session.user_id,
                        path: '/releases/show/' + show,
                        page: page,
                        releases: releases
                    });
                });
        }
    });

    return router;
};