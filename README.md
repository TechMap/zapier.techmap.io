# Techmap integration for Zapier

[Zapier](https://zapier.com) integration for [Techmap](https://techmap.io)'s job postings data: about 8 million new postings per month from 185 sources in 250 countries and territories, available through the Techmap Jobs API on RapidAPI.

| Component | Type | Description |
|---|---|---|
| **New Job Posting** | Trigger (polling) | Triggers when a new job posting matching your filters is added |
| **Find Job Postings** | Search | Finds the newest (or oldest) job postings for a search and date range |

Each trigger poll and each search uses one API request (up to 10 postings) from your RapidAPI plan.

## Requirements

A RapidAPI key subscribed to the [Techmap Jobs API](https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings). The free plan includes 1,000 job postings per month, which suits daily schedules; frequent polling needs a paid plan.

## Development

```bash
npm install
npm test                      # unit tests with mocked API responses
npx zapier-platform-cli push  # deploy a private version (after zapier login / register)
```

## Related

- [MCP server](https://github.com/TechMap/mcp.techmap.io) for AI assistants
- [n8n community node](https://github.com/TechMap/n8n.techmap.io)
- [Pipedream components](https://github.com/TechMap/pipedream.techmap.io)

## License

MIT
