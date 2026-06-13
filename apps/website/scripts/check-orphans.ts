/**
 * Orphan-page detector + full-site internal-link health check.
 *
 * SEO link crawlers (lychee, linkinator, Ahrefs Site Audit, …) can only find
 * pages reachable from other pages — by construction they cannot surface
 * *orphans*: indexable URLs with zero inbound internal links. No free tool does
 * this for you. This script closes that gap with a sitemap-vs-crawl diff:
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
 * Zero external dependencies — Bun's global fetch + a small HTML link extractor.
 *
 * Usage:
 *     bun run check:orphans                          # BASE_URL defaults below
 *     BASE_URL=http://localhost:3000 bun run scripts/check-orphans.ts
 *     LINK_CHECK_SOFT=1 bun run check:orphans         # report only, never exit 1
 *
 * Expects a built site already serving on BASE_URL (`next build` + `next start`).
 */

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const ORIGIN = new URL(BASE_URL).origin;

/** Exit 0 even on findings — for first-rollout / advisory runs. */
const SOFT_MODE = process.env.LINK_CHECK_SOFT === '1';

/**
 * Only orphans are fatal; broken/redirecting links are printed but do not fail
 * the run. Used in CI where lychee already owns the broken/redirect gate, so the
 * two checks don't double-report the same finding. Standalone (default) every
 * issue is fatal, making the script useful on its own.
 */
const ORPHAN_ONLY = process.env.ORPHAN_ONLY === '1';

/** Bounded crawl concurrency — the marketing site is ~60 pages. */
const CONCURRENCY = 10;

/** Per-request timeout (ms). */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sitemap URLs that are intentionally not reachable by crawling <a> links, so
 * they must not be reported as orphans:
 * - llms.txt / llms-full.txt are plain-text AI resources, not linked HTML pages.
 */
const ORPHAN_ALLOWLIST = new Set<string>(['/llms.txt', '/llms-full.txt']);

/**
 * Route prefixes whose content depends on the live backend API. In CI the API
 * is not running, so these pages may render empty or error — exclude them from
 * both orphan reporting and link-health failures to keep the gate deterministic.
 * (When the API is up locally they crawl normally; this only suppresses noise.)
 */
const API_DEPENDENT_PREFIXES = ['/articles/', '/posts/', '/u/'] as const;

/** File extensions treated as assets, not crawlable HTML pages. */
const ASSET_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|pdf|woff2?|ttf|map|zip|mp4|webm)$/i;

interface LinkIssue {
  readonly path: string;
  readonly status: number;
  /** Page the link was first discovered on ("seed" for the crawl roots). */
  readonly source: string;
  /** Redirect target, when status is 3xx. */
  readonly location?: string;
}

interface FetchResult {
  readonly status: number;
  readonly location: string | null;
  readonly isHtml: boolean;
  readonly body: string | null;
}

function isApiDependent(path: string): boolean {
  return API_DEPENDENT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Resolve an href against its source page and reduce it to a same-origin,
 * crawl-stable pathname (no query, no hash, no trailing slash). Returns null for
 * external links, non-HTTP schemes, and asset URLs.
 */
function toInternalPath(href: string, fromPath: string): string | null {
  const trimmed = href.trim();
  if (
    trimmed === '' ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:')
  ) {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(trimmed, `${ORIGIN}${fromPath}`);
  } catch {
    return null;
  }

  if (resolved.origin !== ORIGIN) {
    return null;
  }
  if (ASSET_EXTENSIONS.test(resolved.pathname)) {
    return null;
  }

  let pathname = resolved.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}

/** Normalize a sitemap <loc> URL to a comparable pathname. */
function locToPath(loc: string): string {
  let pathname: string;
  try {
    pathname = new URL(loc.trim()).pathname;
  } catch {
    pathname = loc.trim();
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}

/** Extract every href value from an HTML document. */
function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const pattern = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match !== null) {
    hrefs.push(match[1] ?? match[2] ?? '');
    match = pattern.exec(html);
  }
  return hrefs;
}

async function fetchPath(path: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ORIGIN}${path}`, {
      headers: { 'user-agent': 'genfeed-orphan-check' },
      redirect: 'manual',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const isHtml = contentType.includes('text/html');
    const location = response.headers.get('location');
    const body = isHtml ? await response.text() : null;
    return { body, isHtml, location, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSitemapUniverse(): Promise<Set<string>> {
  const response = await fetch(`${ORIGIN}/sitemap.xml`, {
    headers: { 'user-agent': 'genfeed-orphan-check' },
  });
  if (!response.ok) {
    throw new Error(
      `Could not load /sitemap.xml (HTTP ${response.status}). Is the site built and running on ${BASE_URL}?`,
    );
  }
  const xml = await response.text();
  const universe = new Set<string>();
  const pattern = /<loc>([^<]+)<\/loc>/gi;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match !== null) {
    const path = locToPath(match[1] ?? '');
    if (!ASSET_EXTENSIONS.test(path) && !isApiDependent(path)) {
      universe.add(path);
    }
    match = pattern.exec(xml);
  }
  return universe;
}

interface CrawlOutcome {
  readonly reachable: Set<string>;
  readonly broken: LinkIssue[];
  readonly redirects: LinkIssue[];
}

async function crawl(): Promise<CrawlOutcome> {
  const reachable = new Set<string>();
  const broken: LinkIssue[] = [];
  const redirects: LinkIssue[] = [];

  // path -> page it was first discovered on
  const queued = new Map<string, string>([['/', 'seed']]);
  const frontier: string[] = ['/'];
  let active = 0;

  function enqueue(path: string, source: string): void {
    if (!queued.has(path)) {
      queued.set(path, source);
      frontier.push(path);
    }
  }

  async function processPath(path: string): Promise<void> {
    const source = queued.get(path) ?? 'seed';
    let result: FetchResult;
    try {
      result = await fetchPath(path);
    } catch {
      if (!isApiDependent(path)) {
        broken.push({ path, source, status: 0 });
      }
      return;
    }

    if (result.status >= 300 && result.status < 400) {
      if (!isApiDependent(path)) {
        redirects.push({
          location: result.location ?? '(none)',
          path,
          source,
          status: result.status,
        });
      }
      // Follow once to keep discovering canonical content downstream.
      if (result.location) {
        const target = toInternalPath(result.location, path);
        if (target) {
          enqueue(target, source);
        }
      }
      return;
    }

    if (result.status >= 400) {
      if (!isApiDependent(path)) {
        broken.push({ path, source, status: result.status });
      }
      return;
    }

    // 2xx
    reachable.add(path);
    if (result.isHtml && result.body) {
      for (const href of extractHrefs(result.body)) {
        const internal = toInternalPath(href, path);
        if (internal) {
          enqueue(internal, path);
        }
      }
    }
  }

  // Worker pool draining a frontier that grows as pages are discovered.
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    function fail(error: unknown): void {
      if (!settled) {
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    function pump(): void {
      if (settled) {
        return;
      }
      if (frontier.length === 0 && active === 0) {
        settled = true;
        resolve();
        return;
      }
      while (active < CONCURRENCY && frontier.length > 0) {
        const next = frontier.shift();
        if (next === undefined) {
          break;
        }
        active += 1;
        processPath(next)
          .then(() => {
            active -= 1;
            pump();
          })
          .catch((error: unknown) => {
            active -= 1;
            fail(error);
          });
      }
    }

    pump();
  });

  return { broken, reachable, redirects };
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

  const [universe, outcome] = await Promise.all([
    fetchSitemapUniverse(),
    crawl(),
  ]);
  const { reachable, broken, redirects } = outcome;

  const orphans = [...universe]
    .filter((path) => !reachable.has(path))
    .filter((path) => !ORPHAN_ALLOWLIST.has(path))
    .filter((path) => !isApiDependent(path))
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
