'use strict';

const express = require('express');
const router = express.Router();

module.exports = function(checkAuth) {
    router.get('/refresh', checkAuth, function(req, res) {
        const core = req.app.locals.core;

        if (core.stop()) {
            core.refresh();
        }

        res.redirect('/');
    });

    router.get('/stop', checkAuth, function(req, res) {
        const core = req.app.locals.core;

        core.stop();

        res.redirect('/');
    });

    return router;
};