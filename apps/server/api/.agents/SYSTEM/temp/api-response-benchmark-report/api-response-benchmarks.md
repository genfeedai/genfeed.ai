# API Response Benchmarks

- Generated at: 2026-04-02T02:07:00.471Z
- Baseline: 2026-04-02T02:06:50.875Z
- Regression threshold: 20%

| Endpoint | Route | p50 (ms) | p95 (ms) | Mean (ms) | Status |
| --- | --- | ---: | ---: | ---: | --- |
| Auth-Guarded Tags List | `/v1/organizations/65f000000000000000000003/tags?page=1&limit=25` | 2.00 | 2.80 | 2.12 | ok |
| Organization Brands List | `/v1/organizations/65f000000000000000000003/brands?page=1&limit=25` | 23.09 | 27.04 | 23.83 | ok |
| Organization Posts List | `/v1/organizations/65f000000000000000000003/posts?page=1&limit=25` | 8.40 | 8.69 | 8.45 | ok |

## Refresh Baseline

`bun run check:api-response-benchmarks --update-baseline`
