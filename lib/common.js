'use strict';

// Shared constants, HTTP middleware, request helpers and data normalization
// for the Techmap Job Postings API (served through RapidAPI).

const API_HOST = 'daily-international-job-postings.p.rapidapi.com';
const BASE_URL = `https://${API_HOST}`;
const SEARCH_URL = `${BASE_URL}/api/v2/jobs/search`;
const COUNT_URL = `${BASE_URL}/api/v2/jobs/count`;

const PAGE_SIZE = 10; // fixed by the API
// The API switches to cursor mode at offset >= 10,000, so page 1000 is the last
// page reachable with page-based pagination.
const MAX_PAGE = 1000;
const MAX_REACHABLE_RESULTS = MAX_PAGE * PAGE_SIZE;

const RAPIDAPI_SIGNUP_URL =
  'https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings';

// Filters that are passed 1:1 as query parameters to the API.
const FILTER_KEYS = [
  'countryCode',
  'title',
  'city',
  'state',
  'workPlace',
  'skills',
  'company',
  'occupation',
  'industry',
  'language',
];

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const addRapidApiHeaders = (request, z, bundle) => {
  const apiKey = bundle.authData && bundle.authData.apiKey;
  if (apiKey) {
    request.headers['X-RapidAPI-Key'] = String(apiKey).trim();
  }
  request.headers['X-RapidAPI-Host'] = API_HOST;
  request.headers.Accept = 'application/json';
  // Let handleErrors tell an exhausted monthly quota apart from a short rate limit.
  request.throwForThrottlingEarly = false;
  return request;
};

const extractMessage = (response) => {
  const text = (response.content || '').toString();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.message === 'string') return parsed.message;
  } catch (e) {
    // plain-text error body
  }
  return text.trim().slice(0, 500) || `HTTP ${response.status}`;
};

// Turns RapidAPI / Techmap error responses into clear, actionable Zapier errors.
const handleErrors = (response, z) => {
  const { status } = response;
  if (status < 400) return response;

  const message = extractMessage(response);

  if (status === 401 || status === 403) {
    if (/not subscribed/i.test(message)) {
      throw new z.errors.Error(
        `Your RapidAPI key is not subscribed to the Techmap Job Postings API. ` +
          `Subscribe to a plan (the Basic plan is free) at ${RAPIDAPI_SIGNUP_URL}/pricing and reconnect.`,
        'AuthenticationError',
        status
      );
    }
    throw new z.errors.Error(
      `RapidAPI rejected the API key (${message}). Copy the key from the "X-RapidAPI-Key" header ` +
        `in the RapidAPI playground at ${RAPIDAPI_SIGNUP_URL} and reconnect.`,
      'AuthenticationError',
      status
    );
  }

  if (status === 429) {
    if (/quota/i.test(message)) {
      throw new z.errors.Error(
        `Your RapidAPI plan quota for the Techmap Job Postings API is used up (${message}). ` +
          `Upgrade your plan at ${RAPIDAPI_SIGNUP_URL}/pricing or wait for the next billing period.`,
        'QuotaExceeded',
        status
      );
    }
    throw new z.errors.ThrottledError(`Rate limit reached: ${message}`, 60);
  }

  if (status === 400 || status === 404) {
    // The API answers invalid filters (e.g. an unknown country code or a date
    // older than 3 months) with 400/404 and a descriptive message.
    throw new z.errors.Error(`Techmap API: ${message}`, 'InvalidInput', status);
  }

  if (status === 509) {
    throw new z.errors.Error(
      'The result was too large for a single response. Please narrow your filters.',
      'ResponseTooLarge',
      status
    );
  }

  // Remaining 5xx errors: let Zapier treat them as generic, retryable failures.
  throw new z.errors.Error(
    `Techmap API is temporarily unavailable (HTTP ${status}): ${message}`,
    'ServerError',
    status
  );
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

// Indirection so tests can pin "today".
const clock = { now: () => new Date() };

const isoDay = (date) => date.toISOString().slice(0, 10);

const daysAgo = (days) => {
  const d = clock.now();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDay(d);
};

// Accepts anything Zapier hands over for a datetime field and returns YYYY-MM-DD.
const toIsoDay = (value) => {
  if (!value) return undefined;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : isoDay(parsed);
};

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

const buildFilterParams = (inputData) => {
  const params = {};
  for (const key of FILTER_KEYS) {
    const raw = inputData[key];
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? raw.join(',') : String(raw).trim();
    if (value !== '') params[key] = value;
  }
  if (inputData.excludeDuplicates === true || inputData.excludeDuplicates === 'true') {
    params.isDuplicate = 'false';
  }
  return params;
};

const requireAtLeastOneFilter = (z, params) => {
  if (Object.keys(params).filter((k) => k !== 'isDuplicate').length === 0) {
    throw new z.errors.Error(
      'Please set at least one filter (for example Country, Job Title, City or Work Place).',
      'InvalidInput',
      400
    );
  }
};

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const getCount = async (z, params) => {
  const response = await z.request({ url: COUNT_URL, method: 'GET', params });
  const body = response.data || {};
  return Number(body.totalCount) || 0;
};

const getSearchPage = async (z, params, page) => {
  const response = await z.request({
    url: SEARCH_URL,
    method: 'GET',
    params: { ...params, page: String(page) },
  });
  const body = response.data || {};
  return {
    totalCount: Number(body.totalCount) || 0,
    jobs: Array.isArray(body.result) ? body.result : [],
  };
};

// Returns the most recently collected postings (one search request).
const fetchNewestJobs = async (z, params) => {
  const { totalCount, jobs } = await getSearchPage(z, { ...params, sort: 'newest' }, 1);
  return { total: totalCount, jobs };
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const clean = (value) => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    return value
      .map((v) => (v === undefined || v === null ? '' : String(v).trim()))
      .filter((v) => v !== '' && v !== 'N/A')
      .join(', ');
  }
  const text = String(value).trim();
  return text === 'N/A' ? '' : text;
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toIsoDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const simpleHash = (text) => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
};

// Flattens a raw API job posting into a Zapier-friendly object with a stable id.
const normalizeJob = (job) => {
  const ld = job.jsonLD || {};
  const org = ld.hiringOrganization || {};
  const place = ld.jobLocation || {};
  const address = place.address || {};
  const salary = ld.baseSalary || {};
  const salaryValue = salary.value || {};
  const geo = job.geoPoint || {};

  const url = clean(ld.url);
  const id =
    clean(ld.identifier) || (url ? simpleHash(url) : simpleHash(`${job.title}|${job.dateCreated}`));

  return {
    id,
    title: clean(job.title || ld.title),
    company: clean(job.company || org.name),
    companyUrl: clean(org.url),
    url,
    description: clean(ld.description),
    dateCreated: toIsoDateTime(job.dateCreated),
    datePosted: clean(ld.datePosted),
    validThrough: toIsoDateTime(ld.validThrough || job.dateExpired),
    countryCode: clean(job.countryCode),
    country: clean(address.addressCountry),
    state: clean(job.state),
    city: clean(job.city || address.addressLocality),
    postCode: clean(job.postCode),
    locationName: clean(place.name),
    latitude: toNumberOrNull(geo.lat !== undefined ? geo.lat : place.latitude),
    longitude: toNumberOrNull(geo.lon !== undefined ? geo.lon : place.longitude),
    timezone: clean(job.timezone),
    language: clean(job.language),
    workPlace: clean(job.workPlace),
    workType: clean(job.workType),
    contractType: clean(job.contractType),
    careerLevel: clean(job.careerLevel),
    employmentType: clean(ld.employmentType),
    occupation: clean(job.occupation || ld.relevantOccupation),
    industry: clean(job.industry || ld.industry),
    department: clean(job.department),
    skills: clean(job.skills || ld.skills),
    salaryMin: toNumberOrNull(salaryValue.minValue !== undefined ? salaryValue.minValue : job.minSalary),
    salaryMax: toNumberOrNull(salaryValue.maxValue),
    salaryCurrency: clean(salary.currency || ld.salaryCurrency),
    salaryUnit: clean(salaryValue.unitText),
    isDirect: job.isDirect === true,
    isRecruiter: job.isRecruiter === true,
    source: clean(job.source),
    portal: clean(job.portal),
  };
};

const byDateCreatedDesc = (a, b) => {
  const da = Date.parse(a.dateCreated) || 0;
  const db = Date.parse(b.dateCreated) || 0;
  return db - da;
};

const normalizeAndSort = (rawJobs) => {
  const seen = new Set();
  return rawJobs
    .map(normalizeJob)
    .filter((job) => (seen.has(job.id) ? false : seen.add(job.id)))
    .sort(byDateCreatedDesc);
};

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

const filterInputFields = [
  {
    key: 'countryCode',
    label: 'Country Code',
    helpText:
      'Two-letter ISO 3166-1 country code such as `us`, `de` or `uk`. Separate several codes with commas (e.g. `de,at,ch`) to match any of them.',
    type: 'string',
    required: false,
  },
  {
    key: 'title',
    label: 'Job Title Keywords',
    helpText:
      'Words to look for in the job title. Commas mean OR (`java,python`). Put `+` in front of a word to require it and `-` to exclude it (`+developer,-senior`). Use double quotes for phrases (`"data engineer"`).',
    type: 'string',
    required: false,
  },
  {
    key: 'city',
    label: 'City',
    helpText:
      'City of the workplace, for example `Berlin`. Use double quotes for names with spaces, e.g. `"New York"`. Separate several cities with commas.',
    type: 'string',
    required: false,
  },
  {
    key: 'workPlace',
    label: 'Work Place',
    helpText: 'Only return postings for remote, hybrid or on-site work. Leave empty for all.',
    type: 'string',
    required: false,
    choices: [
      { value: 'remote', sample: 'remote', label: 'Remote' },
      { value: 'hybrid', sample: 'hybrid', label: 'Hybrid' },
      { value: 'onsite', sample: 'onsite', label: 'On-site' },
      { value: 'remote,hybrid', sample: 'remote,hybrid', label: 'Remote or Hybrid' },
    ],
  },
  {
    key: 'skills',
    label: 'Skills',
    helpText:
      'Skills or keywords tagged on the posting, such as `JavaScript` or `SAP`. Comma-separated values match any of them.',
    type: 'string',
    required: false,
  },
  {
    key: 'company',
    label: 'Company',
    helpText: 'Name of the hiring company (can also be a recruiting agency), e.g. `Siemens`.',
    type: 'string',
    required: false,
  },
  {
    key: 'language',
    label: 'Posting Language',
    helpText: 'Two-letter ISO 639-1 code of the language the posting is written in, such as `en` or `de`.',
    type: 'string',
    required: false,
  },
  {
    key: 'excludeDuplicates',
    label: 'Exclude Duplicates',
    helpText:
      'If yes, postings flagged as likely duplicates of another posting (same job on several sites) are skipped.',
    type: 'boolean',
    required: false,
    default: 'no',
  },
];

const jobOutputFields = [
  { key: 'id', label: 'Job ID', type: 'string' },
  { key: 'title', label: 'Job Title', type: 'string' },
  { key: 'company', label: 'Company', type: 'string' },
  { key: 'companyUrl', label: 'Company URL', type: 'string' },
  { key: 'url', label: 'Job URL', type: 'string' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'dateCreated', label: 'Date Created', type: 'datetime' },
  { key: 'datePosted', label: 'Date Posted', type: 'string' },
  { key: 'validThrough', label: 'Valid Through', type: 'datetime' },
  { key: 'countryCode', label: 'Country Code', type: 'string' },
  { key: 'country', label: 'Country', type: 'string' },
  { key: 'state', label: 'State', type: 'string' },
  { key: 'city', label: 'City', type: 'string' },
  { key: 'postCode', label: 'Postal Code', type: 'string' },
  { key: 'locationName', label: 'Location', type: 'string' },
  { key: 'latitude', label: 'Latitude', type: 'number' },
  { key: 'longitude', label: 'Longitude', type: 'number' },
  { key: 'timezone', label: 'Timezone', type: 'string' },
  { key: 'language', label: 'Language', type: 'string' },
  { key: 'workPlace', label: 'Work Place', type: 'string' },
  { key: 'workType', label: 'Work Type', type: 'string' },
  { key: 'contractType', label: 'Contract Type', type: 'string' },
  { key: 'careerLevel', label: 'Career Level', type: 'string' },
  { key: 'employmentType', label: 'Employment Type', type: 'string' },
  { key: 'occupation', label: 'Occupation', type: 'string' },
  { key: 'industry', label: 'Industry', type: 'string' },
  { key: 'department', label: 'Department', type: 'string' },
  { key: 'skills', label: 'Skills', type: 'string' },
  { key: 'salaryMin', label: 'Salary Min', type: 'number' },
  { key: 'salaryMax', label: 'Salary Max', type: 'number' },
  { key: 'salaryCurrency', label: 'Salary Currency', type: 'string' },
  { key: 'salaryUnit', label: 'Salary Unit', type: 'string' },
  { key: 'isDirect', label: 'Is Direct Employer Link', type: 'boolean' },
  { key: 'isRecruiter', label: 'Is Recruiter', type: 'boolean' },
  { key: 'source', label: 'Source', type: 'string' },
  { key: 'portal', label: 'Portal', type: 'string' },
];

module.exports = {
  API_HOST,
  BASE_URL,
  SEARCH_URL,
  COUNT_URL,
  PAGE_SIZE,
  MAX_PAGE,
  MAX_REACHABLE_RESULTS,
  RAPIDAPI_SIGNUP_URL,
  addRapidApiHeaders,
  handleErrors,
  clock,
  daysAgo,
  toIsoDay,
  buildFilterParams,
  requireAtLeastOneFilter,
  getCount,
  getSearchPage,
  fetchNewestJobs,
  normalizeJob,
  normalizeAndSort,
  filterInputFields,
  jobOutputFields,
};
