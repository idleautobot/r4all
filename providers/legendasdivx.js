'use strict';

const debug = require('debug')('LegendasDivx');
const _ = require('lodash');
const URI = require('urijs');
const URITemplate = require('urijs/src/URITemplate');

const log = require('../logger.js');

const URL = URI('https://www.legendasdivx.pt');
const SEARCH_URL = URITemplate(URL.toString() + 'modules.php?name=Downloads&file=jz&d_op=search_next&form_cat=28&imdbid={imdbId}&order=&page={page}');
const SUBTITLE_URL = URITemplate(URL.toString() + 'modules.php?name=Downloads&d_op=viewdownloaddetails&lid={subtitleId}');
const DOWNLOAD_URL = URITemplate(URL.toString() + 'modules.php?name=Downloads&d_op=getit&lid={subtitleId}');

let status = true;

const LegendasDivx = {
    getURL: function() {
        return URL;
    },
    getSearchURL: function(imdbId, page) {
        return SEARCH_URL
            .expand({ imdbId: imdbId, page: page });
    },
    getSubtitleURL: function(subtitleId) {
        return SUBTITLE_URL
            .expand({ subtitleId: subtitleId });
    },
    getDownloadURL: function(subtitleId) {
        return DOWNLOAD_URL
            .expand({ subtitleId: subtitleId });
    },
    isOn: function() {
        return status;
    }
};

// var fetchSubtitle = function(horseman, parsed, imdbId, forceFetch, page) {
//     page = page || 1;

//     var url = this.SEARCH_URL
//         .expand({ imdbId: imdbId.replace(/\D/g, ''), page: page })
//         .toString();

//     debug(url);

//     var _this = this;

//     return horseman
//         .userAgent('Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0')
//         .open(url)
//         .evaluate(function(releaseGroup, forceFetch) {
//             var result = {
//                 successful: true,
//                 subtitleId: null,
//                 nextpage: false
//             };

//             var regex = function(str, regex) {
//                 try {
//                     var match = str.match(regex);
//                     match.shift(); // remove original string that was parsed

//                     if (match.length == 1)
//                         return match[0];
//                     else
//                         return match;
//                 } catch (err) {
//                     return null;
//                 }
//             };

//             try {
//                 // validate the page
//                 if (!$('.tdNAV').length) throw 'site validation failed';

//                 // each subtitle
//                 $('.sub_box').each(function() {
//                     // forceFetch on subtitle or consider only ripped subtitles
//                     if (forceFetch || $(this).find('.sub_main tr td').eq(6).text().trim().match(/Ripadas/i)) {
//                         var re = new RegExp(releaseGroup, 'i');
//                         var description = $(this).find('.sub_main .td_desc').text();

//                         if (description.match(re)) {
//                             result.subtitleId = parseInt(regex($(this).find('.sub_download').attr('href'), /lid=(\d+)$/i));
//                             return false;
//                         }
//                     }
//                 });

//                 // check if there are more pages            
//                 $('.pager_bar').first().find('a').each(function() {
//                     if ($(this).text().match(/Seguinte/i)) {
//                         result.nextpage = true;
//                         return false;
//                     }
//                 });
//             } catch (err) {
//                 result.successful = false;
//                 result.error = err;
//             }

//             return result;
//         }, parsed.group, forceFetch)
//         .then(function(result) {
//             if (result.successful) {
//                 return result.subtitleId || (result.nextpage && _.bind(fetchSubtitle, _this)(horseman, parsed, imdbId, forceFetch, ++page));
//             } else {
//                 throw result.error;
//             }
//         });
// };

// LegendasDivx.prototype.fetchSubtitle = function(releaseName, imdbId, forceFetch) {
//     // init
//     var horseman = new Horseman({ timeout: 30 * 1000, cookiesFile: 'cookies.txt' });

//     var parsed = new Release(releaseName);

//     var _this = this;

//     return _.bind(fetchSubtitle, this)(horseman, parsed, imdbId, forceFetch)
//         .then(function(subtitleId) {
//             if (!_this.isOn) {
//                 _this.isOn = true;
//                 debug('seems to be back');
//             }

//             horseman.close();
//             horseman = null;

//             return subtitleId;
//         })
//         .catch(function(err) {
//             if (_this.isOn) {
//                 _this.isOn = false;
//                 log.error('[LegendasDivx] ', err);
//             }

//             horseman.close();
//             horseman = null;

//             return null;
//         });
// };

module.exports = LegendasDivx;