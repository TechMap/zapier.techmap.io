'use strict';

const {
  buildFilterParams,
  requireAtLeastOneFilter,
  daysAgo,
  fetchNewestJobs,
  normalizeAndSort,
  filterInputFields,
  jobOutputFields,
} = require('../lib/common');
const sample = require('../samples/job_posting.json');

// Look-back window for each poll (in days, inclusive of today). New postings
// can arrive with a dateCreated of up to a few days in the past, so a short
// window catches them while keeping the result set small.
const LOOKBACK_DAYS = 2;

// Polling: 1 request to /jobs/search with sort=newest. Returns up to 10
// postings, newest first.
// Zapier deduplicates on `id`, so each posting triggers only once.
const perform = async (z, bundle) => {
  const params = buildFilterParams(bundle.inputData);
  requireAtLeastOneFilter(z, params);
  params.dateCreatedMin = daysAgo(LOOKBACK_DAYS);
  params.dateCreatedMax = daysAgo(0);

  const { jobs } = await fetchNewestJobs(z, params);
  return normalizeAndSort(jobs);
};

module.exports = {
  key: 'new_job_posting',
  noun: 'Job Posting',
  display: {
    label: 'New Job Posting',
    description:
      'Triggers when a new job posting matching your filters (country, job title, city, work place) is added.',
  },
  operation: {
    type: 'polling',
    perform,
    inputFields: [
      {
        key: 'filters_note',
        type: 'copy',
        helpText:
          'Set at least one filter. Each check uses 1 API request (up to 10 postings) from your RapidAPI plan, so keep filters focused. Only postings from the last 3 days are considered.',
      },
      ...filterInputFields,
    ],
    outputFields: jobOutputFields,
    sample,
  },
};
