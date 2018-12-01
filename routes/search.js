'use strict';

const express = require('express');
const router = express.Router();

module.exports = function(getLayoutData) {
    router.get('/', function(req, res) {
        const s = req.query.s;

        if (s) {
            if (s.match(/^tt\d+$/)) { // check for title_id
                res.redirect('/releases/imdb/' + s + '/');
            } else {
                res.redirect('/search/' + s);
            }
        } else {
            res.redirect('/releases/');
        }
    });

    router.get('/:search', getLayoutData, async function(req, res) {
        const db = req.app.locals.db;
        const s = req.params.search;

        const releases = await db.getReleases('search', 1, s);

        res.render('releases', {
            title: 'Search',
            isAuthed: !!req.session.user_id,
            path: '/search/' + s,
            page: 1,
            releases: releases
        });
    });

    router.get('/:search/page/:page', getLayoutData, async function(req, res) {
        const db = req.app.locals.db;
        const s = req.params.search;
        const page = req.params.page;

        const releases = await db.getReleases('search', page, s);

        res.render('releases', {
            title: 'Search',
            isAuthed: !!req.session.user_id,
            path: '/search/' + s,
            page: page,
            releases: releases
        });
    });

    return router;
};