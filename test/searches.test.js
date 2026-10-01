'use strict';

const zapier = require('zapier-platform-core');
const nock = require('nock');
const App = require('../index');
const fixture = require('./fixtures/search_response.json');
const { API_KEY, pinClock, api } = require('./helpers');

const appTester = zapier.createAppTester(App);
const perform = App.searches.find_job_postings.operation.perform;
const authData = { apiKey: API_KEY };

describe('search: Find Job Postings', () => {
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

  it('defaults to the last 7 days, newest first', async () => {
    const q = { countryCode: 'de', dateCreatedMin: '2026-09-25', dateCreatedMax: '2026-10-01' };
    const scope = api()
      .get('/api/v2/jobs/search')
      .query({ ...q, sort: 'newest', page: '1' })
      .reply(200, fixture);

    const results = await appTester(perform, { authData, inputData: { countryCode: 'de' } });
    expect(scope.isDone()).toBe(true);
    expect(results[0].id).toBe('675b101b57a080181cfce999');
  });

  it('uses one request for oldest first and honors the date inputs', async () => {
    const scope = api()
      .get('/api/v2/jobs/search')
      .query({
        title: '"data engineer"',
        dateCreatedMin: '2026-09-01',
        dateCreatedMax: '2026-09-15',
        page: '1',
      })
      .reply(200, fixture);

    const results = await appTester(perform, {
      authData,
      inputData: {
        title: '"data engineer"',
        postedAfter: '2026-09-01T00:00:00Z',
        postedBefore: '2026-09-15',
        order: 'oldest',
      },
    });
    expect(scope.isDone()).toBe(true);
    expect(results.map((r) => r.id)).toEqual(['675b101b57a080181cfce40e', '675b101b57a080181cfce999']);
  });

  it('rejects an inverted date range', async () => {
    await expect(
      appTester(perform, {
        authData,
        inputData: { countryCode: 'de', postedAfter: '2026-09-20', postedBefore: '2026-09-10' },
      })
    ).rejects.toThrow(/Posted After/);
  });

  it('returns an empty list when nothing matches', async () => {
    api().get('/api/v2/jobs/search').query(true).reply(200, { ...fixture, totalCount: 0, result: [] });
    const results = await appTester(perform, { authData, inputData: { company: 'Nobody Inc' } });
    expect(results).toEqual([]);
  });
});
