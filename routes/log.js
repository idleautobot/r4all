'use strict';

var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var express = require('express');
var _ = require('lodash');
var moment = require('moment');
var router = express.Router();

function getLogFiles() {
    var dir = process.env.OPENSHIFT_LOG_DIR || process.cwd();

    return _.filter(fs.readdirSync(dir), function (file) {
        var name = path.join(dir, file);
        var isDir = fs.statSync(name).isDirectory();
        return !isDir && file.match(/^server\.log/);
    });
}

function queryLog(file) {
    var winston = require('winston');
    var dir = process.env.OPENSHIFT_LOG_DIR || process.cwd();
    var name = path.join(dir, file);

    var l = new(winston.Logger)({
        transports: [
            new(winston.transports.File)({
                filename: name
            })
        ]
    });

    var options = {
        from: moment().subtract(1, 'y').toDate(),
        limit: 10e6
    };

    return new Promise(function (resolve, reject) {
        l.query(options, function (err, result) {
            l.close();

            if (err) {
                reject(err);
            } else {
                resolve(result.file);
            }
        });
    });
}

module.exports = function (getLayoutData) {
    router.get('/', getLayoutData, function (req, res) {
        if (!req.url.endsWith('/')) {
            req.session.query = req.query;
            res.redirect('/log/');
        } else {
            var query = req.session.query;
            req.session.query = null;

            var logFiles = getLogFiles();
            var curFile = query && query.file && logFiles.indexOf(query.file) > -1 ? query.file : logFiles[logFiles.length - 1];
            var curLevels = (query && query.levels) || ['error', 'warn'];

            queryLog(curFile)
                .then(function (content) {
                    res.render('log', {
                        title: 'Log',
                        isAuthed: !!req.session.user_id,
                        logFiles: logFiles,
                        curFile: curFile,
                        curLevels: curLevels,
                        content: content
                    });
                })
                .catch(function (err) {
                    res.status(400).send(err);
                });
        }
    });

    return router;
};
