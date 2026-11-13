import {
  type BrandScraperHttp,
  MAX_HTML_BYTES,
} from '@api/services/brand-scraper/brand-scraper-http.util';
import type { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import type {
  WebsiteFetchBudget,
  WebsiteScrapingResult,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';
import { isBrandKitGuidanceNoise } from '@genfeedai/helpers';
import * as cheerio from 'cheerio';

const WHITESPACE_RUNS_PATTERN = /\s+/g;
const WWW_PREFIX_PATTERN = /^www\./iu;
const MAX_SUPPORTING_PAGES = 2;
const MAX_PAGE_EXCERPT_CHARS = 900;
const MIN_EXCERPT_BLOCK_CHARS = 40;

/** Page kinds worth reading after the homepage, best first. */
const SUPPORTING_PAGE_PATTERNS: readonly RegExp[] = [
  /^\/(?:about|about-us|company|our-story|story|mission)\/?$/iu,
  /^\/(?:products?|services?|solutions?|features?|what-we-do|offerings?)\/?$/iu,
  /^\/(?:pricing|plans|shop)\/?$/iu,
];

/** Supporting pages never take more than this from the scan's time budget. */
export const SUPPORTING_PAGES_BUDGET_MS = 10_000;
/** Below this much remaining time the homepage result is returned as it is. */
export const SUPPORTING_PAGES_MIN_REMAINING_MS = 12_000;

function hostWithoutWww(url: URL): string {
  return url.hostname.replace(WWW_PREFIX_PATTERN, '').toLowerCase();
}

/**
 * Same-site pages that say what the brand does: about, then product or
 * service, then pricing. One page per kind, so two fetches at most.
 */
export function pickSupportingPageUrls(
  links: string[],
  pageUrl: string,
): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const found = new Map<number, string>();
  for (const href of links) {
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (hostWithoutWww(url) !== hostWithoutWww(base)) continue;
    const kind = SUPPORTING_PAGE_PATTERNS.findIndex((pattern) =>
      pattern.test(url.pathname),
    );
    if (kind === -1 || found.has(kind)) continue;
    url.hash = '';
    url.search = '';
    found.set(kind, url.toString());
  }
  return [...found.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, url]) => url)
    .slice(0, MAX_SUPPORTING_PAGES);
}

/**
 * The readable copy of a page: its headings and paragraphs, without
 * navigation, footers or scripts, cut to a short excerpt.
 */
export function extractPageExcerpt(html: string): string | undefined {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, form, svg').remove();
  const blocks: string[] = [];
  $('h1, h2, h3, p, li').each((_index, element) => {
    const text = $(element).text().replace(WHITESPACE_RUNS_PATTERN, ' ').trim();
    if (
      text.length >= MIN_EXCERPT_BLOCK_CHARS &&
      !isBrandKitGuidanceNoise(text)
    )
      blocks.push(text);
  });
  const excerpt = [...new Set(blocks)]
    .join(' ')
    .slice(0, MAX_PAGE_EXCERPT_CHARS);
  return excerpt.length >= MIN_EXCERPT_BLOCK_CHARS ? excerpt : undefined;
}

export interface SupportingPagesDeps {
  http: BrandScraperHttp;
  parser: BrandWebsiteParserService;
  userAgent: string;
}

async function readPageHtml(
  url: string,
  budget: WebsiteFetchBudget,
  deps: SupportingPagesDeps,
): Promise<string | undefined> {
  const response = await deps.http.fetchWithRetry(
    url,
    {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': deps.userAgent,
      },
      redirect: 'follow',
    },
    budget,
  );
  try {
    if (!response.ok) return undefined;
    deps.parser.assertHtmlResponse(response);
    return await deps.http.readWebsiteBody(
      response,
      budget,
      undefined,
      MAX_HTML_BYTES,
    );
  } finally {
    await deps.http.releaseWebsiteResponse(response);
  }
}

/**
 * Reads the about, product or pricing page the homepage links to, so the brand
 * analysis sees what the brand sells and not only its landing copy. The pages
 * are fetched in parallel within a short slice of the scan's time budget.
 * Best-effort: a slow, blocked or empty page is skipped and noted, and the
 * homepage result stands. Every page goes through the same SSRF-guarded client
 * as the homepage.
 */
export async function addSupportingPages(
  scrapedData: IScrapedBrandData,
  rawContent: WebsiteScrapingResult,
  budget: WebsiteFetchBudget,
  deps: SupportingPagesDeps,
): Promise<void> {
  const urls = rawContent.supportingPageUrls ?? [];
  const now = performance.now();
  if (
    urls.length === 0 ||
    budget.deadlineAt - now < SUPPORTING_PAGES_MIN_REMAINING_MS
  )
    return;
  const pageBudget = {
    deadlineAt: Math.min(budget.deadlineAt, now + SUPPORTING_PAGES_BUDGET_MS),
  };
  const pages = await Promise.all(
    urls.map(async (url) => {
      try {
        const html = await readPageHtml(url, pageBudget, deps);
        return { excerpt: html ? extractPageExcerpt(html) : undefined, url };
      } catch {
        return { excerpt: undefined, failed: true, url };
      }
    }),
  );
  if (pages.some((page) => 'failed' in page))
    rawContent.diagnostics?.push({
      code: 'brand_scrape.supporting_page_failed',
      message: 'A supporting page could not be read and was skipped.',
      severity: 'warning',
    });
  const readable = pages.filter(
    (page): page is { excerpt: string; url: string } => Boolean(page.excerpt),
  );
  if (readable.length === 0) return;
  scrapedData.pageExcerpts = readable.map((page) => page.excerpt);
  rawContent.evidence = [
    ...(rawContent.evidence ?? []),
    ...readable.map((page) => ({
      sourceType: 'website' as const,
      label: 'Website page',
      url: deps.parser.sanitizeProvenanceUrl(page.url),
    })),
  ];
}
