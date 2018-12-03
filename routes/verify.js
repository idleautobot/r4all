'use strict';

const express = require('express');
const router = express.Router();

module.exports = function(checkAuth, getLayoutData) {
    router.get('/moviereleases', checkAuth, getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;

            const toVerify = await db.getUnverifiedMovies();

            res.render('verifymoviereleases', {
                title: 'Verify Movie Releases',
                isAuthed: !!req.session.user_id,
                toVerify: toVerify
            });
        }
    });

    router.get('/shows', checkAuth, getLayoutData, async function(req, res) {
        if (!req.url.endsWith('/')) {
            req.originalUrl += '/';
            res.redirect(req.originalUrl);
        } else {
            const db = req.app.locals.db;

            const toVerify = await db.getUnverifiedShows();

            res.render('verifyshows', {
                title: 'Verify Shows',
                isAuthed: !!req.session.user_id,
                toVerify: toVerify
            });
        }
    });

    return router;
};