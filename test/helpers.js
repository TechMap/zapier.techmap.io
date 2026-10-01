'use strict';

const nock = require('nock');
const common = require('../lib/common');

const FIXED_NOW = '2026-10-01T12:00:00.000Z';
const API_KEY = 'test-rapidapi-key-1234567890abcd';

const pinClock = () => {
  common.clock.now = () => new Date(FIXED_NOW);
};

const api = () =>
  nock(common.BASE_URL, {
    reqheaders: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': common.API_HOST,
    },
  });

const countBody = (totalCount) => ({
  api: 'Techmap.io Job Posting API',
  apiVersion: 'v2.6',
  apiEndpoint: 'GET count for Job Postings',
  totalCount,
  query: {},
});

module.exports = { FIXED_NOW, API_KEY, pinClock, api, countBody };
