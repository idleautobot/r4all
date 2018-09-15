'use strict';

module.exports = {
    // ####################
    // database
    // ####################

    MONGODB_SERVICE_HOST: (process.env.MONGODB_SERVICE_HOST || '127.0.0.1'),
    MONGODB_SERVICE_PORT: (process.env.MONGODB_SERVICE_PORT || '27017'),
    MONGODB_DATABASE: (process.env.MONGODB_DATABASE || 'r4all'),
    MONGODB_USER: (process.env.MONGODB_USER || 'admin'),
    MONGODB_PASSWORD: (process.env.MONGODB_PASSWORD || 'dtDsBJHl0IFsLPht'),

    // ####################
    // core functionality
    // ####################

    // http request timeout
    requestTimeout: (parseInt(process.env.APP_REQUEST_TIMEOUT_SECONDS) || 60) * 1000,

    // delay between each http request attempt (retry)
    requestAttemptsInterval: (parseInt(process.env.APP_REQUEST_ATTEMPTS_INTERVAL_SECONDS) || 5) * 1000,

    // core - refesh time interval
    coreRefreshInterval: (parseInt(process.env.APP_CORE_REFRESH_INTERVAL_MINUTES) || 5) * 60 * 1000,

    // ####################
    // app settings
    // ####################

    // app session secret
    sessionSecret: (process.env.APP_SESSION_SECRET || 'dummy@secret'),

    // admin user password
    adminPassword: (process.env.APP_ADMIN_PASSWORD || 'admin'),

    // dashboard - # records per page 
    dashboardPageRecords: parseInt(process.env.APP_DASHBOARD_PAGE_RECORDS) || 50,

    // app - # records per page 
    appPageRecords: parseInt(process.env.APP_PAGE_RECORDS) || 50
};