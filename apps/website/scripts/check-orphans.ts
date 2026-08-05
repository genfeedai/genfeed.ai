/**
 * Orphan-page detector + full-site internal-link health check.
 *
 * SEO link crawlers (lychee, linkinator, …) can only find pages reachable from
 * other pages — by construction they cannot surface *orphans*: indexable URLs
 * with zero inbound internal links. This script closes that gap with a
 * sitemap-vs-crawl diff:
 *
 *     universe  = every <loc> in /sitemap.xml      (the SEO-intended page set)
 *     reachable = every page found by BFS-crawling internal <a> links from "/"
 *     orphans   = universe − reachable − allowlist
 *
 * As a bonus it doubles as a full-depth internal-link health check: any internal
 * link that returns a redirect (3xx) or an error (>=400) is reported and fails
 * the run. Internal links must point at canonical URLs, never at a redirect —
 * the exact bug class fixed in PR #559 (footer/nav links to /for/:slug,
 * /creators, /agencies, … that 301 to /use-cases/*). lychee guards the seeded
 * pages; this guards every page, at every depth.
 *
 * On-page SEO (titles, descriptions, canonicals, headings, structured data) is
 * the sibling gate: `bun run check:seo`. Both share ./seo/crawl.ts.
 *
 * Usage:
 *     bun run check:orphans                          # BASE_URL defaults below
 *     BASE_URL=http://localhost:3000 bun run scripts/check-orphans.ts
 *     LINK_CHECK_SOFT=1 bun run check:orphans         # report only, never exit 1
 *
 * Expects a built site already serving on BASE_URL (`next build` + `next start`).
 */

import {
  ASSET_EXTENSIONS,
  crawlSite,
  fetchSitemapUniverse,
  type LinkIssue,
} from './seo/crawl';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const ORIGIN = new URL(BASE_URL).origin;
const USER_AGENT = 'genfeed-orphan-check';

/** Exit 0 even on findings — for first-rollout / advisory runs. */
const SOFT_MODE = process.env.LINK_CHECK_SOFT === '1';

/**
 * Only orphans are fatal; broken/redirecting links are printed but do not fail
 * the run. Used in CI where lychee already owns the broken/redirect gate, so the
 * two checks don't double-report the same finding. Standalone (default) every
 * issue is fatal, making the script useful on its own.
 */
const ORPHAN_ONLY = process.env.ORPHAN_ONLY === '1';

/** Bounded crawl concurrency — the marketing site is ~80 pages. */
const CONCURRENCY = 10;

/** Per-request timeout (ms). */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sitemap URLs that are intentionally not reachable by crawling <a> links, so
 * they must not be reported as orphans:
 * - llms.txt / llms-full.txt are plain-text AI resources, not linked HTML pages.
 * - /retainer, /dfy, /fleet are high-ticket pitch pages: deliberately kept out
 *   of nav/footer (direct-send sales collateral + ad landing pages) but listed
 *   in the sitemap so a shared link stays indexable.
 */
const ORPHAN_ALLOWLIST = new Set<string>([
  '/llms.txt',
  '/llms-full.txt',
  '/retainer',
  '/dfy',
  '/fleet',
]);

/**
 * Route prefixes whose *content* depends on the live backend API. In CI the API
 * is not running, so these pages may render empty or error — exclude them from
 * orphan reporting and link-health failures to keep the gate deterministic.
 *
 * This suppresses link *health* only. It does not excuse a missing 404: a
 * request for a slug that does not exist must still answer 404, and
 * `check:seo` probes these same route families for exactly that.
 */
const API_DEPENDENT_PREFIXES = ['/articles/', '/posts/', '/u/'] as const;

function isApiDependent(path: string): boolean {
  return API_DEPENDENT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function reportIssues(label: string, issues: LinkIssue[]): void {
  if (issues.length === 0) {
    return;
  }
  console.error(`\n${label} (${issues.length}):`);
  for (const issue of issues) {
    const suffix = issue.location !== undefined ? ` → ${issue.location}` : '';
    const status = issue.status === 0 ? 'ERR' : issue.status;
    console.error(
      `  [${status}] ${issue.path}${suffix}  (from ${issue.source})`,
    );
  }
}

async function main(): Promise<void> {
  console.info(`Link check + orphan scan against ${BASE_URL}\n`);

  const [sitemap, outcome] = await Promise.all([
    fetchSitemapUniverse({ origin: ORIGIN, userAgent: USER_AGENT }),
    crawlSite({
      concurrency: CONCURRENCY,
      isSuppressed: isApiDependent,
      origin: ORIGIN,
      seeds: ['/'],
      timeoutMs: REQUEST_TIMEOUT_MS,
      userAgent: USER_AGENT,
    }),
  ]);
  const { reachable, broken, redirects } = outcome;

  const universe = new Set(
    [...sitemap.paths].filter(
      (path) => !ASSET_EXTENSIONS.test(path) && !isApiDependent(path),
    ),
  );

  const orphans = [...universe]
    .filter((path) => !reachable.has(path))
    .filter((path) => !ORPHAN_ALLOWLIST.has(path))
    .sort();

  console.info(`Sitemap URLs (universe):   ${universe.size}`);
  console.info(`Crawl-reachable pages:     ${reachable.size}`);
  console.info(`Internal redirecting links:${redirects.length}`);
  console.info(`Internal broken links:     ${broken.length}`);
  console.info(`Orphan pages:              ${orphans.length}`);

  reportIssues('Broken internal links', broken);
  reportIssues(
    'Redirecting internal links (should point at canonical URL)',
    redirects,
  );

  if (orphans.length > 0) {
    console.error(
      `\nOrphan pages — in sitemap but unreachable by internal links (${orphans.length}):`,
    );
    for (const path of orphans) {
      console.error(`  ${path}`);
    }
  }

  const failures = ORPHAN_ONLY
    ? orphans.length
    : broken.length + redirects.length + orphans.length;
  if (failures === 0) {
    const scope = ORPHAN_ONLY ? 'orphan pages' : 'link or orphan issues';
    console.info(`\nNo ${scope}. ✓`);
    return;
  }

  if (SOFT_MODE) {
    console.info(
      `\n${failures} issue(s) found — LINK_CHECK_SOFT=1, not failing the run.`,
    );
    return;
  }

  console.error(`\n${failures} issue(s) found. Failing.`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
