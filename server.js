'use strict';

process.env.DEBUG = 'Server, FreeProxyLists, Core, RARBG, IMDb, Addic7ed, LegendasDivx';

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
app.locals.startupTime = require('moment-timezone')().tz('Europe/Lisbon');
app.locals.settings = require('./settings.js');
app.locals.common = require('./common.js');
app.locals.db = require('./database.js');
app.locals.core = require('./core.js');
app.locals.providers = {
    rarbg: require('./providers/rarbg.js'),
    imdb: require('./providers/imdb.js'),
    //trakttv: require('./providers/trakttv.js'),
    //themoviedb: require('./providers/themoviedb.js'),
    //addic7ed: require('./providers/addic7ed.js'),
    //legendasdivx: require('./providers/legendasdivx.js')
};
app.locals._ = require('lodash');
app.locals.moment = require('moment-timezone');

// set server info
app.set('port', 8080);
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

function memoryUsage() {
    var data = {
        date: app.locals.moment().tz('Europe/Lisbon').toDate(),
        rss: process.memoryUsage().rss
    };

    return app.locals.db.insertMemoryUsage(data)
        .then(setTimeout(memoryUsage, 15 * 60 * 1000));
};

process.env.NODE_ENV = 'production';

(function initApp(isProduction) {
    app.locals.db.initialize()
        .then(function() {
            return isProduction && memoryUsage();
        })
        .then(function() {
            http.createServer(app).listen(app.get('port'), app.get('ip'), function() {
                debug('express server listening on port ' + app.get('port'));
                return (isProduction && app.locals.core.refresh());
            });
        })
        .catch(function(err) {
            console.log(err);
        });
})(process.env.NODE_ENV === 'production');

// const puppeteer = require('puppeteer');

// (async function launch(instance = 0) {
//     let browser = null;
//     let page = null;

//     try {
//         browser = await puppeteer.launch();
//         page = await browser.newPage();

//         page.on('error', async function(err) {
//             console.log('[' + instance + '] PageOnError: caught!');
//         });

//         page.on('load', async function(err) {
//             //console.log(browser.process().pid);
//             console.log('[' + instance + '] loaded');
//             return setTimeout(async function(){
//                 try { await browser.close(); } catch (err) {};
//                 await launch(++instance);                
//             }, 5000);
//         });

//         console.log('[' + instance + '] loading...');

//         await page.goto('http://www.google.com');
//     } catch (err) {
//         console.log('[' + instance + '] OnError: caught!', err);
//     }
// })();

// const puppeteer = require('puppeteer');

// function sleep(ms = 0) {
//     return new Promise(r => setTimeout(r, ms));
// }

// (async function launch(instance = 0) {
//     let browser = null;
//     let page = null;

//     try {
//         if(instance < 100) {
//             browser = await puppeteer.launch();
//             page = await browser.newPage();

//             page.on('error', async function(err) {
//                 console.log('[' + instance + '] PageOnError: caught!');
//             });

//             page.on('load', async function(err) {
//                 console.log('[' + instance + '] loaded');
//                 try { await page.close(); } catch (err) { console.log(err); };
//                 try { await browser.close(); } catch (err) { console.log(err); };
//                 await launch(++instance);
//             });

//             console.log('[' + instance + '] loading...');

//             await page.goto('http://www.google.com');            
//         } else {
//             await sleep(5*60*1000);
//         }
//     } catch (err) {
//         console.log('[' + instance + '] OnError: caught!', err);
//     }
// })();


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