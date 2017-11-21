'use strict';

var express = require('express');
var router = express.Router();

module.exports = function (checkAuth) {
    router.get('/refresh', checkAuth, function (req, res) {
        var core = req.app.locals.core;

        if (core.isOn) {
            if (!core.isBusy) {
                core.stop();
                core.refresh();
            }
        } else {
            core.refresh();
        }

        res.redirect('/');
    });

    router.get('/stop', checkAuth, function (req, res) {
        var core = req.app.locals.core;

        var stopCore = function () {
            if (core.isBusy) {
                setTimeout(stopCore, 5 * 1000);
            } else {
                core.stop();
                res.redirect('/');
            }
        };

        stopCore();
    });

    return router;
};
