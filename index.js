var request = require('request-promise').defaults({ jar: true });
var cheerio = require('cheerio');
var Promise = require('bluebird');
var TerminalTable = require('terminal-table');

///

var ENV = {
  MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN,
  MAILGUN_KEY: process.env.MAILGUN_KEY,
  MAILGUN_RECIPIENT: process.env.MAILGUN_RECIPIENT,
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
          var isLink = function(el) {
            return el.name === 'a';
          }

          if (rawVisitInfo.children.some(isLink)) {
            var parentEl = rawVisitInfo.children.find(isLink);
          } else {
            var parentEl = rawVisitInfo;
          }

          var attrVal = parentEl.children[0].data.replace(/(\r\n|\n|\r)/gm, "").trim();

          if (attrVal) {
            var attrName = i === 1 ? 'name' : 'date';
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

function createTable(serializedVisits) {
  return new Promise(function(resolve, reject) {
    var table = new TerminalTable({
      leftPadding: 5,
      rightPadding: 5
    });

    serializedVisits.forEach(function(serializedVisit) {
      table.push(
        [serializedVisit.name, serializedVisit.date]
      );
    });

    resolve(table);
  });
}

function notifyUser(table) {
  return new Promise(function(resolve, reject) {
    var mailgun = require('mailgun-js')({ apiKey: ENV.MAILGUN_KEY, domain: ENV.MAILGUN_DOMAIN });

    var data = {
      from: `Collcal Bot <bot@${ENV.MAILGUN_DOMAIN}>`,
      to: ENV.MAILGUN_RECIPIENT,
      subject: 'Collcall Run',
      text: ("" + table)
    };

    mailgun.messages().send(data, function(error, body) {
      if (error) {
        reject(error);
      } else {
        resolve(body);
      }
    });
  });
}

///

seedCookies()
.then(authenticateUser)
.then(getRawVisits)
.then(ingestRawVisits)
.then(convertRawVisits)
.then(createTable)
.then(notifyUser)
.then(function(mailResp) {
  console.log('successfully completed a run: ' + JSON.stringify(mailResp));
})
.catch(function(err) {
  console.log('err: ' + err);
});
