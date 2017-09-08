if (!process.env.RUN) {
  console.log('not running...');
}


var request = require('request-promise').defaults({ jar: true });
var cheerio = require('cheerio');
var Promise = require('bluebird');

///

var ENV = {
  NAVIANCE_SCHOOL_ID: process.env.NAVIANCE_SCHOOL_ID,
  NAVIANCE_USERNAME:  process.env.NAVIANCE_USERNAME,
  NAVIANCE_PASSWORD:  process.env.NAVIANCE_PASSWORD
};

///

function seedCookies() {
  return request({
    method: 'get',
    url: `https://connection.naviance.com/family-connection/auth/login?hsid=${ENV.NAVIANCE_SCHOOL_ID}`
  });
}

function authenticateUser() {
  return request({
    method: 'post',
    url: 'https://connection.naviance.com/family-connection/auth/login/authenticate',
    headers: {
      'X-Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest'
    },
    qs: {
      username: ENV.NAVIANCE_USERNAME,
      password: ENV.NAVIANCE_PASSWORD,
      is_ajax: true
    },
  });
}

function getRawVisits() {
  return request({
    method: 'get',
    url: 'https://connection.naviance.com/family-connection/colleges/visit'
  });
}

function ingestRawVisits(html) {
  return new Promise(function(resolve, reject) {
    var $ = cheerio.load(html);
    var rawVisits = $('table.standard').children('tbody').children('tr');

    resolve([$, rawVisits]);
  });
}

function convertRawVisits(args) {
  var $ = args[0];
  var rawVisits = args[1];

  return new Promise(function(resolve, reject) {
    var serializedVisits = [];

    rawVisits.each(function(index, rawVisit) {
      var serializedVisit = {};

      $(rawVisit).children('td').each(function(i, rawVisitInfo) {
        if (i === 1 || i === 2) {
          var attrName = i === 1 ? 'name' : 'date';
          var attrVal = rawVisitInfo.children[0].data.replace(/(\r\n|\n|\r)/gm, "").trim();

          if (attrVal) {
            serializedVisit[attrName] = attrVal;
          }
        }
      });

      if (!Object.keys(serializedVisit).length) {
        // nothing set, garbage table entry...
      } else {
        serializedVisits.push(serializedVisit);
      }
    });

    resolve(serializedVisits);
  });
}

///

seedCookies()
.then(authenticateUser)
.then(getRawVisits)
.then(ingestRawVisits)
.then(convertRawVisits)
.then(function(serializedVisits) {
  console.log(serializedVisits);
});
