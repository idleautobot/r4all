var path = require('path');
var winston = require('winston');
var moment = require('moment-timezone');

// log levels
var winston_config = {
    levels: {
        error: 0,
        warn: 1,
        info: 2
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green'
    }
};

// Extend a winston by making it expand errors when passed in as the 
// second argument (the first argument is the log level).
function expandErrors(logger) {
    var oldLogFunc = logger.log;

    logger.log = function() {
        var args = Array.prototype.slice.call(arguments, 0);

        if (args.length >= 2 && args[2] instanceof Error) {
            args[2] = args[2].stack;
        }

        return oldLogFunc.apply(this, args);
    };

    return logger;
}

var logger = expandErrors(new(winston.Logger)({
    transports: [
        new(winston.transports.Console)({
            timestamp: function() {
                return moment().tz('Europe/Lisbon').format('YYYY-MM-DD HH:mm:ss');
            },
            colorize: true
        }),
        new(require('winston-daily-rotate-file'))({
            filename: 'server.log',
            datePattern: '.yyyy-MM'
        })
    ],
    levels: winston_config.levels,
    colors: winston_config.colors,
}));

process.on('uncaughtException', function(err) {
    if (err.message == 'read ECONNRESET' || err.message.endsWith(' == 0')) {
        // ignore - from the request module, not correctly handled
    } else {
        logger.error('uncaughtException', err);
    }
});

module.exports = logger;