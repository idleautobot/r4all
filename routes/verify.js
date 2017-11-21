'use strict';

var express = require('express');
var router = express.Router();

module.exports = function(checkAuth, getLayoutData) {
    router.get('/movies', checkAuth, getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;

            db.getUnverifiedMovies()
                .then(function(toVerify) {
                    res.render('verifymovies', {
                        title: 'Verify Movies',
                        isAuthed: !!req.session.user_id,
                        toVerify: toVerify
                    });
                });
        }
    });

    router.get('/shows', checkAuth, getLayoutData, function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            var db = req.app.locals.db;

            db.getUnverifiedShows()
                .then(function(toVerify) {
                    res.render('verifyshows', {
                        title: 'Verify Shows',
                        isAuthed: !!req.session.user_id,
                        toVerify: toVerify
                    });
                });
        }
    });

    return router;
};