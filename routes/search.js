'use strict';

var express = require('express');
var _ = require('lodash');
var router = express.Router();

module.exports = function (getLayoutData) {
    router.get('/', function (req, res) {
        var s = req.query.s;

        if (s) {
            if (s.match(/^tt\d+$/)) { // check for title_id
                res.redirect('/releases/imdb/' + s + '/');
            } else {
                var db = req.app.locals.db;

                db.getShow(s)
                    .then(function (isShow) {
                        if (isShow) {
                            res.redirect('/releases/show/' + s + '/');
                        } else {
                            res.redirect('/search/' + s);
                        }
                    });
            }
        } else {
            res.redirect('/releases/');
        }
    });

    router.get('/:search', getLayoutData, function (req, res) {
        var db = req.app.locals.db;
        var s = req.params.search;

        db.getReleases('search', 1, s)
            .then(function (releases) {
                res.render('releases', {
                    title: 'Search',
                    isAuthed: !!req.session.user_id,
                    path: '/search/' + s,
                    page: 1,
                    releases: releases
                });
            });
    });

    router.get('/:search/page/:page', getLayoutData, function (req, res) {
        var db = req.app.locals.db;
        var s = req.params.search;
        var page = req.params.page;

        db.getReleases('search', page, s)
            .then(function (releases) {
                res.render('releases', {
                    title: 'Search',
                    isAuthed: !!req.session.user_id,
                    path: '/search/' + s,
                    page: page,
                    releases: releases
                });
            });
    });

    return router;
};
