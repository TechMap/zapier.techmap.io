'use strict';

const { compileApp, validateApp } = require('zapier-platform-core/src/tools/schema');
const App = require('../index');
const { normalizeJob } = require('../lib/common');
const sample = require('../samples/job_posting.json');
const fixture = require('./fixtures/search_response.json');

describe('app definition', () => {
  it('passes the Zapier schema validation', () => {
    expect(validateApp(compileApp(App))).toEqual([]);
  });

  it('uses HTTPS for every URL and title case labels', () => {
    const json = JSON.stringify(App, (k, v) => (typeof v === 'function' ? undefined : v));
    expect(json).not.toMatch(/http:\/\//);
    for (const op of [App.triggers.new_job_posting, App.searches.find_job_postings]) {
      expect(op.display.label).toMatch(/^([A-Z][a-z]*\s?)+$/);
    }
    expect(App.triggers.new_job_posting.display.description).toMatch(/^Triggers when .*\.$/);
  });

  it('has a sample whose keys match the output fields and live results', () => {
    const outputKeys = App.triggers.new_job_posting.operation.outputFields.map((f) => f.key).sort();
    const sampleKeys = Object.keys(sample).sort();
    const liveKeys = Object.keys(normalizeJob(fixture.result[0])).sort();
    expect(sampleKeys).toEqual(outputKeys);
    expect(liveKeys).toEqual(outputKeys);
    expect(sample.id).toBeTruthy();
    expect(sample.dateCreated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it('does not use the word "scraping" in user-facing text (Zapier policy 1.7)', () => {
    const json = JSON.stringify(App, (k, v) => (typeof v === 'function' ? undefined : v));
    expect(json.toLowerCase()).not.toContain('scrap');
  });
});
