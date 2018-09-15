const { createLogger, addColors, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const moment = require('moment-timezone');

// Set up logger
const myCustomLevels = {
    levels: {
        fatal: 0,
        crit: 1,
        warn: 2,
        info: 3,
        debug: 4,
        trace: 5
    },
    colors: {
        trace: 'white',
        debug: 'greenBG',
        info: 'cyanBG',
        warn: 'yellowBG',
        crit: 'magentaBG',
        fatal: 'redBG'
    }
};

const timestamp = format((info, opts) => {
    info.timestamp = moment().tz('Europe/Lisbon').format('YYYY-MM-DD HH:mm:ss');
    return info;
});

const logger = createLogger({
    level: 'trace',
    levels: myCustomLevels.levels,
    transports: [
        new transports.Console({
            format: format.combine(
                timestamp(),
                format.colorize(),
                format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
            ),
        }),
        new DailyRotateFile({
            dirname: './debug',
            filename: '%DATE%_debug.log',
            datePattern: 'YYYY-MM',
            level: 'fatal',
            handleExceptions: true,
            format: format.combine(
                format.timestamp(),
                format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
            )
        })
    ],
    exitOnError: false
});

addColors(myCustomLevels.colors);

module.exports = logger;