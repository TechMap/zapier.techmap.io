'use strict';

const {
  buildFilterParams,
  requireAtLeastOneFilter,
  daysAgo,
  toIsoDay,
  fetchNewestJobs,
  getSearchPage,
  normalizeAndSort,
  filterInputFields,
  jobOutputFields,
} = require('../lib/common');
const sample = require('../samples/job_posting.json');

const DEFAULT_LOOKBACK_DAYS = 6; // last 7 days including today

const perform = async (z, bundle) => {
  const input = bundle.inputData;
  const params = buildFilterParams(input);
  requireAtLeastOneFilter(z, params);

  params.dateCreatedMin = toIsoDay(input.postedAfter) || daysAgo(DEFAULT_LOOKBACK_DAYS);
  params.dateCreatedMax = toIsoDay(input.postedBefore) || daysAgo(0);
  if (params.dateCreatedMin > params.dateCreatedMax) {
    throw new z.errors.Error('"Posted After" must be on or before "Posted Before".', 'InvalidInput', 400);
  }

  // One search request, newest or oldest first.
  let jobs;
  if (input.order === 'oldest') {
    ({ jobs } = await getSearchPage(z, params, 1));
  } else {
    ({ jobs } = await fetchNewestJobs(z, params));
  }

  const results = normalizeAndSort(jobs);
  if (input.order === 'oldest') results.reverse();
  return results;
};

module.exports = {
  key: 'find_job_postings',
  noun: 'Job Posting',
  display: {
    label: 'Find Job Postings',
    description:
      'Finds up to 10 job postings matching your filters (country, job title, city, work place and more).',
  },
  operation: {
    perform,
    inputFields: [
      ...filterInputFields,
      {
        key: 'postedAfter',
        label: 'Posted After',
        helpText:
          'Only return postings created on or after this date. Defaults to 7 days ago. The API holds about the last 3 months.',
        type: 'datetime',
        required: false,
      },
      {
        key: 'postedBefore',
        label: 'Posted Before',
        helpText: 'Only return postings created on or before this date. Defaults to today.',
        type: 'datetime',
        required: false,
      },
      {
        key: 'order',
        label: 'Order',
        helpText:
          '**Newest first** returns the most recently added matches, **Oldest first** the earliest. Each uses 1 API request.',
        type: 'string',
        required: false,
        default: 'newest',
        choices: [
          { value: 'newest', sample: 'newest', label: 'Newest first' },
          { value: 'oldest', sample: 'oldest', label: 'Oldest first' },
        ],
      },
    ],
    outputFields: jobOutputFields,
    sample,
  },
};
