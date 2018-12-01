'use strict';

const express = require('express');
const router = express.Router();

// **************************************************
// app feed
// **************************************************
router.post('/feed', function (req, res) {
    var db = req.app.locals.db;

    db.getFeed(req.body)
        .then(function (releases) {
            res.json(releases);
        });
});

// **************************************************
// app views
// **************************************************
router.post(/\/view\/(feed|movies|shows|imdb|detail)$/, function (req, res) {
    var db = req.app.locals.db;

    db.getAppView(req.body)
        .then(function (releases) {
            res.json(releases);
        });
});

// **************************************************
// get showList
// **************************************************
router.get('/shows', function (req, res) {
    var db = req.app.locals.db;

    db.getShowList()
        .then(function (shows) {
            res.json(shows);
        });
});

// **************************************************
// app put calls
// **************************************************
router.put('/release', function (req, res) {
    var db = req.app.locals.db;
    var common = req.app.locals.common;
    var release = req.body;

    if (release.apikey == 'c3maj95i20s214vs84umcke8h19hklv4k3ucjqbsxubxwm7yh4wc3t399rllo9rx') {
        delete release.apikey;

        if (release.name && release.category && common.scene.typeMatch[release.category] && release.name == common.scene.getReleaseName(release.name, release.category) && common.scene.parseRelease(release.name, release.category)) {
            release._id = release.name.replace(/[^\w_]/g, '').toUpperCase();
            release.parsed = common.scene.parseRelease(release.name, release.category);
            release.date = new Date();

            if (release.category.charAt(0) == 's') {
                release.showId = release.parsed.releaseTitle;
            }

            db.upsertRelease(release)
                .then(function () {
                    res.json({ status: 'ok' });
                });
        } else if (release.feedname && release[release.feedname] && release.category && common.scene.typeMatch[release.category]) {
            release[release.feedname] = parseInt(release[release.feedname]);

            db.upsertPending(release, release.feedname)
                .then(function () {
                    res.json({ status: 'ok' });
                });
        } else {
            res.status(400).send('Invalid data.');
        }
    } else {
        res.status(400).send('Invalid API key.');
    }
});

router.put('/imdb', function (req, res) {
    var db = req.app.locals.db;
    var imdb = req.app.locals.providers.imdb;
    var imdbId = req.body && req.body.imdbId;

    if (imdbId && imdbId.match(/^tt\d+$/)) {
        imdb.fetchInfo(imdbId)
            .then(function (imdbInfo) {
                if (!imdbInfo) throw 'Unable to fetch imdb info.';

                return db.upsertIMDb(imdbInfo)
                    .then(function () {
                        res.json(imdbInfo);
                    });
            })
            .catch(function (err) {
                res.status(400).send(err);
                return;
            });
    } else {
        res.status(400).send('Invalid data.');
    }
});

module.exports = router;
