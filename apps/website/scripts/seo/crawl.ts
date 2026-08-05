/**
 * Shared site-crawl engine.
 *
 * One BFS crawler, two consumers: check-orphans.ts (link health + orphan diff)
 * and check-seo.ts (on-page SEO + structured data). Keeping the traversal in one
 * place stops the two gates drifting into disagreement about what "a page" is.
 *
 * Zero external dependencies — global fetch plus a small HTML link extractor.
 */

/** File extensions treated as assets, not crawlable HTML pages. */
export const ASSET_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|pdf|woff2?|ttf|map|zip|mp4|webm)$/i;

export interface LinkIssue {
  readonly path: string;
  readonly status: number;
  /** Page the link was first discovered on ("seed" for the crawl roots). */
  readonly source: string;
  /** Redirect target, when status is 3xx. */
  readonly location?: string;
}

export interface FetchResult {
  readonly status: number;
  readonly location: string | null;
  readonly isHtml: boolean;
  readonly body: string | null;
}

export interface CrawledPage {
  readonly path: string;
  readonly status: number;
  readonly isHtml: boolean;
  readonly html: string | null;
  /** Page this one was first discovered on ("seed" for the crawl roots). */
  readonly source: string;
}

export interface CrawlOptions {
  readonly origin: string;
  readonly concurrency: number;
  readonly timeoutMs: number;
  readonly userAgent: string;
  /** Paths to start from. Defaults to the site root. */
  readonly seeds?: readonly string[];
  /** Paths matching this are crawled but never reported as broken/redirecting. */
  readonly isSuppressed?: (path: string) => boolean;
}

export interface CrawlResult {
  /** Every 2xx page keyed by pathname. */
  readonly pages: Map<string, CrawledPage>;
  readonly reachable: Set<string>;
  readonly broken: LinkIssue[];
  readonly redirects: LinkIssue[];
  /** Outgoing internal links per crawled page, in document order. */
  readonly linksFrom: Map<string, string[]>;
}

/**
 * Resolve an href against its source page and reduce it to a same-origin,
 * crawl-stable pathname (no query, no hash, no trailing slash). Returns null for
 * external links, non-HTTP schemes, and asset URLs.
 */
export function toInternalPath(
  href: string,
  fromPath: string,
  origin: string,
): string | null {
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
    resolved = new URL(trimmed, `${origin}${fromPath}`);
  } catch {
    return null;
  }

  if (resolved.origin !== origin) {
    return null;
  }
  if (ASSET_EXTENSIONS.test(resolved.pathname)) {
    return null;
  }

  return stripTrailingSlash(resolved.pathname);
}

/** Drop a trailing slash from everything except the site root. */
export function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}

/** Normalize a sitemap <loc> URL to a comparable pathname. */
export function locToPath(loc: string): string {
  let pathname: string;
  try {
    pathname = new URL(loc.trim()).pathname;
  } catch {
    pathname = loc.trim();
  }
  return stripTrailingSlash(pathname);
}

/** Extract every href value from an HTML document. */
export function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const pattern = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match !== null) {
    hrefs.push(match[1] ?? match[2] ?? '');
    match = pattern.exec(html);
  }
  return hrefs;
}

export async function fetchPath(
  path: string,
  options: Pick<CrawlOptions, 'origin' | 'timeoutMs' | 'userAgent'>,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(`${options.origin}${path}`, {
      headers: { 'user-agent': options.userAgent },
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

export interface SitemapUniverse {
  /** Every <loc> reduced to a pathname. */
  readonly paths: Set<string>;
  /**
   * Origin the sitemap advertises publicly. This is the origin canonical tags
   * must use, and it differs from the crawl origin when auditing localhost.
   */
  readonly publicOrigin: string;
}

/** Read /sitemap.xml and return its <loc> set plus the origin it declares. */
export async function fetchSitemapUniverse(
  options: Pick<CrawlOptions, 'origin' | 'userAgent'>,
): Promise<SitemapUniverse> {
  const response = await fetch(`${options.origin}/sitemap.xml`, {
    headers: { 'user-agent': options.userAgent },
  });
  if (!response.ok) {
    throw new Error(
      `Could not load /sitemap.xml (HTTP ${response.status}). Is the site built and running on ${options.origin}?`,
    );
  }
  const xml = await response.text();
  const paths = new Set<string>();
  let publicOrigin = options.origin;
  let hasOrigin = false;

  const pattern = /<loc>([^<]+)<\/loc>/gi;
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match !== null) {
    const loc = (match[1] ?? '').trim();
    paths.add(locToPath(loc));
    if (!hasOrigin) {
      try {
        publicOrigin = new URL(loc).origin;
        hasOrigin = true;
      } catch {
        // Relative <loc>; keep the crawl origin.
      }
    }
    match = pattern.exec(xml);
  }

  return { paths, publicOrigin };
}

/**
 * BFS-crawl every internal link reachable from the seeds, bounded by a worker
 * pool. Redirects are followed once so discovery continues past a 3xx, but the
 * redirecting link itself is still recorded.
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawlResult> {
  const { origin, concurrency, isSuppressed } = options;
  const seeds = options.seeds ?? ['/'];

  const pages = new Map<string, CrawledPage>();
  const reachable = new Set<string>();
  const broken: LinkIssue[] = [];
  const redirects: LinkIssue[] = [];
  const linksFrom = new Map<string, string[]>();

  const queued = new Map<string, string>(seeds.map((seed) => [seed, 'seed']));
  const frontier: string[] = [...seeds];
  let active = 0;

  function suppressed(path: string): boolean {
    return isSuppressed?.(path) ?? false;
  }

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
      result = await fetchPath(path, options);
    } catch {
      if (!suppressed(path)) {
        broken.push({ path, source, status: 0 });
      }
      return;
    }

    if (result.status >= 300 && result.status < 400) {
      if (!suppressed(path)) {
        redirects.push({
          location: result.location ?? '(none)',
          path,
          source,
          status: result.status,
        });
      }
      if (result.location) {
        const target = toInternalPath(result.location, path, origin);
        if (target) {
          enqueue(target, source);
        }
      }
      return;
    }

    if (result.status >= 400) {
      if (!suppressed(path)) {
        broken.push({ path, source, status: result.status });
      }
      return;
    }

    reachable.add(path);
    pages.set(path, {
      html: result.body,
      isHtml: result.isHtml,
      path,
      source,
      status: result.status,
    });

    if (result.isHtml && result.body) {
      const outgoing: string[] = [];
      for (const href of extractHrefs(result.body)) {
        const internal = toInternalPath(href, path, origin);
        if (internal) {
          outgoing.push(internal);
          enqueue(internal, path);
        }
      }
      linksFrom.set(path, outgoing);
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
      while (active < concurrency && frontier.length > 0) {
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

  return { broken, linksFrom, pages, reachable, redirects };
}
