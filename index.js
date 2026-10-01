'use strict';

const { version: platformVersion } = require('zapier-platform-core');
const { version } = require('./package.json');

const authentication = require('./authentication');
const { addRapidApiHeaders, handleErrors } = require('./lib/common');
const newJobPosting = require('./triggers/new_job_posting');
const findJobPostings = require('./searches/find_job_postings');

module.exports = {
  version,
  platformVersion,

  flags: {
    // Keep empty optional fields as-is instead of Zapier's default cleanup (check D028).
    cleanInputData: false,
  },

  authentication,

  beforeRequest: [addRapidApiHeaders],
  afterResponse: [handleErrors],

  triggers: {
    [newJobPosting.key]: newJobPosting,
  },

  searches: {
    [findJobPostings.key]: findJobPostings,
  },

  creates: {},

  resources: {},
};
