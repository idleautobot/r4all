'use strict';

process.env.DEBUG = 'Server, Core, Addic7ed, IMDb, LegendasDivx, RARBG';

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
//app.locals.core = require('./core.js');
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

// (function initApp(isProduction) {
//     app.locals.db.initialize()
//         .then(function() {
//             return isProduction && memoryUsage();
//         })
//         .then(function() {
//             http.createServer(app).listen(app.get('port'), app.get('ip'), function() {
//                 debug('express server listening on port ' + app.get('port'));
// // return app.locals.db.getReleasesToVerify()
// //         .each(function(release) {
// //             return app.locals.providers.imdb.fetchInfo(release.imdbId, release.type)
// //         });
//                 return (isProduction && app.locals.core.refresh());
//             });
//         })
//         .catch(function(err) {
//             console.log(err);
//         });
// })(process.env.NODE_ENV === 'production');




(async () => {
  const releases = await app.locals.providers.rarbg.fetchReleases();
  console.log('done');
  console.log(Object.keys(app.locals.providers.rarbg.newReleases).length);
  console.log(app.locals.providers.rarbg.newReleases);
})();

// (async () => {
  // const imdbInfo = await app.locals.providers.imdb.fetch('tt0418279', 'movie');
  // console.log(imdbInfo);
// })();

// (async () => {
//   const imdbInfo = await app.locals.providers.imdb.fetch('tt6468322', 'show');
//   console.log(imdbInfo);
// })();


// const oleoo = require('oleoo')

// let release = oleoo.parse('The.Big.Bang.Theory.S11E06.720p.HDTV.X264-DIMENSION', {
//   strict: true, // if no main tags found, will throw an exception
//   defaults: {} // defaults values for : language, resolution and year
// })

// console.log(console.log(release));














// return app.locals.providers.imdb.fetchInfo('tt5071412', 'show')
//     .then(function(imdbInfo) {
//         console.log(imdbInfo);
//     });

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

// options
// const options = {
//     strict: true, // if no main tags found, will throw an exception
//     defaults: {} // defaults values for : language, resolution and year
// }

// var Release = require('scene-release-parser');
// var _ = app.locals._;

// return app.locals.db.initialize()
//     .then(function() {
//         return app.locals.db.getReleasesToVerify();
//     })
//     .then(function(releases) {
//         console.log('properly tagged...');

//         // properly tagged
//         _.forEach(releases, function(r) {
//             if (r.name.indexOf(r.category.quality) == -1) {
//                 console.log(r.name);
//             }
//         });

//         console.log('obey scene naming rules...');

//         // obey scene naming rules
//         _.forEach(releases, function(r) {
//             if (app.locals.common.regex(/([^a-zA-Z0-9-._() ])/, r.name)) {
//                 console.log(r.name);
//             }
//         });

//         // parsing
//         _.forEach(releases, function(r) {
//             var parsed;

//             try {
//                 parsed = new Release(r.name, options)
//             } catch (err) {
//                 console.log(r.name);
//             }

//             //console.log(parsed);
//         });
//         // var group = app.locals.common.regex(/-([a-zA-Z0-9]+)$/, release.name);
//         // if(!group) {
//         //     console.log(release.name)
//         // }
//     })
//     .then(function() {
//         console.log('done');
//     })