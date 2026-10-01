'use strict';

const zapier = require('zapier-platform-core');
const nock = require('nock');
const App = require('../index');
const { API_KEY, pinClock, api, countBody } = require('./helpers');

const appTester = zapier.createAppTester(App);

describe('authentication', () => {
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

  it('tests the key with one narrow count request (no postings delivered)', async () => {
    const scope = api()
      .get('/api/v2/jobs/count')
      .query({ countryCode: 'li', dateCreated: '2026-09-29', title: '"zapier connection test"' })
      .reply(200, countBody(0));

    const result = await appTester(App.authentication.test, { authData: { apiKey: API_KEY } });
    expect(result.totalCount).toBe(0);
    expect(scope.isDone()).toBe(true);
  });

  it('retries the per-second rate limit of the free plan', async () => {
    require('../lib/common').clock.retryDelayMs = 1;
    const scope = api()
      .get('/api/v2/jobs/count')
      .query(true)
      .reply(429, { message: 'You have exceeded the rate limit per second for your plan, BASIC, by the API provider' })
      .get('/api/v2/jobs/count')
      .query(true)
      .reply(200, countBody(0));

    const result = await appTester(App.authentication.test, { authData: { apiKey: API_KEY } });
    expect(result.totalCount).toBe(0);
    expect(scope.isDone()).toBe(true);
  });

  it('explains an invalid key', async () => {
    nock('https://daily-international-job-postings.p.rapidapi.com')
      .get('/api/v2/jobs/count')
      .query(true)
      .reply(403, { message: 'Invalid API key. Go to https://docs.rapidapi.com/docs/keys for more info.' });

    await expect(
      appTester(App.authentication.test, { authData: { apiKey: 'wrong' } })
    ).rejects.toThrow(/RapidAPI rejected the API key/);
  });

  it('explains a missing subscription', async () => {
    api()
      .get('/api/v2/jobs/count')
      .query(true)
      .reply(403, { message: 'You are not subscribed to this API.' });

    await expect(
      appTester(App.authentication.test, { authData: { apiKey: API_KEY } })
    ).rejects.toThrow(/not subscribed to the Techmap Job Postings API/);
  });

  it('builds a connection label without exposing the key', async () => {
    const label = App.authentication.connectionLabel(null, { authData: { apiKey: API_KEY } });
    expect(label).toBe('RapidAPI key ending in abcd');
    expect(label).not.toContain(API_KEY.slice(0, 10));
  });
});
