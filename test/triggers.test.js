'use strict';

const zapier = require('zapier-platform-core');
const nock = require('nock');
const App = require('../index');
const fixture = require('./fixtures/search_response.json');
const { API_KEY, pinClock, api } = require('./helpers');

const appTester = zapier.createAppTester(App);
const perform = App.triggers.new_job_posting.operation.perform;
const authData = { apiKey: API_KEY };

describe('trigger: New Job Posting', () => {
  beforeAll(() => {
    if (!nock.isActive()) nock.activate();
    nock.disableNetConnect();
  });
  beforeEach(pinClock);
  afterEach(() => nock.cleanAll());
  afterAll(() => {
    nock.cleanAll();
    nock.restore();
    nock.enableNetConnect();
  });

  it('fetches the newest postings with one request, dedupes and sorts newest first', async () => {
    const expectedQuery = {
      countryCode: 'de',
      title: 'developer',
      city: 'Berlin',
      workPlace: 'hybrid',
      dateCreatedMin: '2026-09-29',
      dateCreatedMax: '2026-10-01',
    };
    const scope = api()
      .get('/api/v2/jobs/search')
      .query({ ...expectedQuery, sort: 'newest', page: '1' })
      .reply(200, fixture);

    const results = await appTester(perform, {
      authData,
      inputData: { countryCode: 'de', title: 'developer', city: 'Berlin', workPlace: 'hybrid' },
    });

    expect(scope.isDone()).toBe(true);
    expect(results).toHaveLength(2); // duplicate id removed
    expect(results.map((r) => r.id)).toEqual(['675b101b57a080181cfce999', '675b101b57a080181cfce40e']);

    const berlin = results[1];
    expect(berlin).toMatchObject({
      title: 'Software Developer (m/w/d)',
      company: 'Acme Software GmbH',
      url: 'https://www.example.com/jobad/1',
      city: 'Berlin',
      country: 'Germany',
      workPlace: 'Hybrid',
      careerLevel: '', // "N/A" is dropped
      department: '',
      skills: 'JavaScript, Java, Scrum',
      salaryMin: 55000,
      salaryMax: 80000,
      salaryCurrency: 'EUR',
      salaryUnit: 'YEAR',
      latitude: 52.5234299,
      dateCreated: '2026-09-29T08:15:00.000Z',
      validThrough: '2026-11-28T08:15:00.000Z',
      isRecruiter: true,
    });
    expect(results[0].workPlace).toBe('Remote, Hybrid');
  });


  it('returns an empty list when nothing matches', async () => {
    const scope = api().get('/api/v2/jobs/search').query(true).reply(200, { ...fixture, totalCount: 0, result: [] });
    const results = await appTester(perform, { authData, inputData: { countryCode: 'li', title: 'astronaut' } });
    expect(results).toEqual([]);
    expect(scope.isDone()).toBe(true);
  });

  it('passes boolean operators through URL-encoded (+ becomes %2B)', async () => {
    let rawPath = '';
    api()
      .get('/api/v2/jobs/search')
      .query(true)
      .reply(function reply(uri) {
        rawPath = uri;
        return [200, { ...fixture, totalCount: 0, result: [] }];
      });
    await appTester(perform, { authData, inputData: { title: '+developer,-senior', excludeDuplicates: true } });
    expect(rawPath).toContain('title=%2Bdeveloper%2C-senior');
    expect(rawPath).toContain('isDuplicate=false');
  });

  it('requires at least one filter', async () => {
    await expect(appTester(perform, { authData, inputData: { excludeDuplicates: true } })).rejects.toThrow(
      /at least one filter/
    );
  });


  it('reports an exhausted monthly quota', async () => {
    api()
      .get('/api/v2/jobs/search')
      .query(true)
      .reply(429, { message: 'You have exceeded the MONTHLY quota for Requests on your current plan, BASIC.' });
    await expect(appTester(perform, { authData, inputData: { countryCode: 'de' } })).rejects.toThrow(
      /quota .* is used up/
    );
  });

  it('throttles on rate limits', async () => {
    api().get('/api/v2/jobs/search').query(true).reply(429, { message: 'Too many requests' });
    await expect(appTester(perform, { authData, inputData: { countryCode: 'de' } })).rejects.toMatchObject({
      name: 'ThrottledError',
    });
  });

  it('surfaces plain-text validation errors from the API', async () => {
    api()
      .get('/api/v2/jobs/search')
      .query(true)
      .reply(400, "Problem getting documents for countryCode 'xx': Not a valid countryCode or in wrong format 'cc' (must be ISO3166-2)!");
    await expect(appTester(perform, { authData, inputData: { countryCode: 'xx' } })).rejects.toThrow(
      /Not a valid countryCode/
    );
  });
});
