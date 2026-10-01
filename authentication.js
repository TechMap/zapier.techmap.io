'use strict';

const { COUNT_URL, RAPIDAPI_SIGNUP_URL, daysAgo } = require('./lib/common');

// Connection test.
// Uses the COUNT endpoint (returns a number, never job postings) with a very
// narrow filter: Liechtenstein, one day, a title phrase that practically never
// matches. Cost: exactly 1 RapidAPI request to /api/v2/jobs/count per
// connection test; no job postings are delivered. See SUBMISSION-zapier.md for
// how RapidAPI meters this request.
const test = async (z) => {
  const response = await z.request({
    url: COUNT_URL,
    method: 'GET',
    params: {
      countryCode: 'li',
      dateCreated: daysAgo(2),
      title: '"zapier connection test"',
    },
  });
  const body = response.data || {};
  return { totalCount: Number(body.totalCount) || 0, api: body.api || 'Techmap.io Job Posting API' };
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'RapidAPI Key',
      required: true,
      type: 'password',
      helpText:
        `Your personal RapidAPI key. Subscribe to the Techmap Job Postings API on RapidAPI ` +
        `(the Basic plan is free and includes 1,000 job postings per month), then copy the value of ` +
        `the **X-RapidAPI-Key** header shown in the [RapidAPI playground](${RAPIDAPI_SIGNUP_URL}).`,
    },
  ],
  test,
  // Identifies the connection without exposing the secret: only the last 4 characters are shown.
  connectionLabel: (z, bundle) => {
    const key = String((bundle.authData && bundle.authData.apiKey) || '').trim();
    return key.length > 8 ? `RapidAPI key ending in ${key.slice(-4)}` : 'RapidAPI key';
  },
};
