# Four-origin SEO audit

Run the version-controlled watchdog with Node from the repository root:

```sh
node scripts/seo/watchdog.mjs
```

It requires the repository's Playwright and Cheerio dependencies and a Brave
installation. Run browser verification on the designated verification host.
`SEO_REPORT_DIR` selects the output directory (default `reports/seo`);
`SEO_DISPOSITIONS_PATH` selects an optional reviewed disposition inventory
(default `docs/seo/5515-dispositions.json`). Copy the last successful timestamped
snapshot and `latest.json` into a new report directory before comparing runs.
Do not substitute an incomplete or failed run for that baseline.

The crawler covers marketing, documentation, marketplace, and app origins. It
records fetched and rendered observations, discovery sources, HTTP status and
redirects, robots/sitemaps, metadata, structured data, links, and exactly five
stable mobile PageSpeed targets per origin when available. Missing CrUX field
data and PageSpeed API failures remain explicitly unavailable measurements;
lab data is not substituted for LCP, CLS, or INP field data.

A previously discovered URL that is absent from current discovery and now
returns direct 404/410 is recorded separately as a hard-cut probe. It does not
remain in the next active crawl. A retired URL that still responds 200 or is
still linked remains actionable. App authentication pages must stay noindex.

## Reviewed dispositions

`5515-dispositions.json` freezes all 128 issue fingerprints (11 errors and 117
warnings) from snapshot `2026-09-28T08-26-41-001Z`, with the exact original
observations, URL/rule, responsible owner, source mapping, and rationale.
[Issue #5515](https://github.com/genfeedai/genfeed.ai/issues/5515) owns release
tracking and current delivery evidence.

- `accepted`: a page-specific editorial exception. The original observation
  must still match. Account-page exceptions also require non-indexability.
- `source_correction`: a source change exists but is not evidence of release.
- `deployment_pending`: the relevant source already changed or was removed;
  verify the production response and rendered page before considering it fixed.

Raw findings and historical diffs remain visible. The disposition summary is
separate, so accepted warnings cannot hide new errors or make a source-only
change look deployed. Changed observations need review. A missing inventory is
reported rather than silently suppressing findings.

The 200-word rule is a heuristic, not a content specification. Directories,
forms, visual galleries, and focused reference pages may be complete below
that threshold. Exceptions do not certify unrelated product, price, or
competitor claims. Do not fabricate reviews, ratings, catalogue items, or
product behavior to improve a count.

A release is complete only with current-head required CI, independent review,
and a successful post-deploy crawl that proves corrected metadata, sitemap
coverage, direct retired-route hard cuts, and no indexable app URL. Keep these
artifacts in the report directory and link evidence from the issue.
