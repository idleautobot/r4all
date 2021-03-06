'use strict';

process.env.DEBUG = 'Server, DB, FreeProxyLists, Core, RARBG, IMDb, Addic7ed, LegendasDivx';

var path = require('path');
var http = require('http');
var debug = require('debug')('Server');
var express = require('express');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var expressLayouts = require('express-ejs-layouts');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');

var app = express();

// set express locals
app.locals.startupTime = require('moment')();
app.locals.settings = require('./settings.js');
app.locals.common = require('./common.js');
app.locals.db = require('./database.js');
app.locals.core = require('./core.js');
app.locals.providers = {
    freeproxylists: require('./providers/freeproxylists.js'),
    rarbg: require('./providers/rarbg.js'),
    imdb: require('./providers/imdb.js'),
    trakttv: require('./providers/trakttv.js'),
    themoviedb: require('./providers/themoviedb.js'),
    addic7ed: require('./providers/addic7ed.js'),
    legendasdivx: require('./providers/legendasdivx.js')
};
app.locals._ = require('lodash');
app.locals.moment = require('moment-timezone');

// set server info
app.set('port', 80);
app.set('ip', '0.0.0.0');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon(path.join(__dirname, 'public', 'favicon.png')));
app.use(morgan('combined', {
    skip: function(req, res) {
        return res.statusCode < 400;
    }
}));
app.use(expressLayouts);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());
app.use(session({
    secret: app.locals.settings.sessionSecret,
    key: 'sid',
    resave: true,
    saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'public')));

require('./routes')(app);

async function memoryUsage() {
    const db = app.locals.db;
    const data = {
        date: app.locals.moment().tz('Europe/Lisbon').toDate(),
        rss: process.memoryUsage().rss
    };

    await db.insertMemoryUsage(data);
    setTimeout(memoryUsage, 15 * 60 * 1000);
}

process.setMaxListeners(Infinity);
process.on('warning', e => console.warn(e.stack));

(async function initApp(isProduction) {
    const db = app.locals.db;
    const core = app.locals.core;

    try {
        await db.init();

        if (isProduction) memoryUsage();

        http.createServer(app).listen(app.get('port'), app.get('ip'), function() {
            debug('express server listening on port ' + app.get('port'));

            if (isProduction) core.refresh();
        });
    } catch (err) {
        console.log(err);
    }
})(process.env.NODE_ENV === 'production');

// return app.locals.providers.legendasdivx.fetchSubtitle('Overdrive.2017.LIMITED.720p.BluRay.x264-DRONES', 'tt1935194', true)
//     .then(function(subtitle) {
//         console.log(subtitle);
//     });


// return app.locals.providers.addic7ed.fetchSubtitle(parsed, 11, 6, 126)
//     .then(function(subtitle) {
//         console.log(subtitle);
//         return app.locals.providers.addic7ed.download(subtitle);
//     })
//     .then(function(subtitle) {
//         console.log(subtitle);
//     });