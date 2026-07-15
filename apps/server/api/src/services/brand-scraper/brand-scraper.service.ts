import { assertHostNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import type {
  BrandScrapeSources,
  LinkedInScrapedData,
  MergedBrandAnalysis,
  MetaTagFallbackData,
  WebsiteScrapingResult,
  XProfileScrapedData,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type {
  IExtractedBrandData,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 10_000;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Maximum number of retry attempts for rate-limited (429) requests */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay in ms for exponential backoff on 429 responses */
const RETRY_BASE_DELAY_MS = 1_000;

/** Maximum redirect hops followed (each re-validated against the SSRF blocklist) */
const MAX_REDIRECTS = 5;

/** HTTP status codes we follow as redirects (re-validating each Location) */
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * BrandScraperService
 *
 * Scrapes brand websites using fetch + cheerio and extracts brand information including:
 * - Company name, tagline, description
 * - Logo and brand colors
 * - Social media links
 * - Content for brand voice analysis
 */
@Injectable()
export class BrandScraperService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandWebsiteParser: BrandWebsiteParserService,
  ) {}

  /**
   * Scrape a website URL and extract brand information
   */
  async scrapeWebsite(url: string): Promise<IScrapedBrandData> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { url });

    const normalizedUrl = this.normalizeUrl(url);

    try {
      const rawContent = await this.fetchAndParse(normalizedUrl);
      const scrapedData = this.brandWebsiteParser.extractBrandData(
        rawContent,
        normalizedUrl,
      );

      this.loggerService.log(`${caller} completed`, {
        companyName: scrapedData.companyName,
        url: normalizedUrl,
      });

      return scrapedData;
    } catch (error: unknown) {
      this.loggerService.warn(
        `${caller} full scrape failed, falling back to meta tags`,
        { error: (error as Error)?.message, url: normalizedUrl },
      );

      try {
        const fallback = await this.scrapeMetaTagsFallback(normalizedUrl);
        const companyName = this.brandWebsiteParser.extractCompanyName(
          fallback.title,
          fallback.ogTitle,
        );

        return {
          aboutText: undefined,
          bannerUrl: fallback.ogImage,
          companyName: companyName || fallback.siteName,
          description: fallback.description || fallback.ogDescription,
          fontCandidates: [],
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: undefined,
          metaDescription: fallback.description,
          ogImage: fallback.ogImage,
          primaryColor: undefined,
          scrapedAt: fallback.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: normalizedUrl,
          tagline: fallback.ogTitle,
          valuePropositions: [],
        };
      } catch (fallbackError: unknown) {
        this.loggerService.error(
          `${caller} meta tag fallback also failed`,
          fallbackError,
        );
        throw error;
      }
    }
  }

  /**
   * Scrape website and analyze with AI to generate complete brand data
   */
  async scrapeAndAnalyze(url: string): Promise<IExtractedBrandData> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { url });

    try {
      const scrapedData = await this.scrapeWebsite(url);

      return {
        ...scrapedData,
        brandVoice: undefined,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Scrape a public LinkedIn company page for brand information
   */
  async scrapeLinkedIn(url: string): Promise<LinkedInScrapedData> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { url });

    try {
      const normalizedUrl = this.normalizeUrl(url);

      const response = await this.fetchWithRetry(normalizedUrl, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': BROWSER_USER_AGENT,
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch LinkedIn page: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const result: LinkedInScrapedData = {
        companyName:
          $('h1').first().text().trim() ||
          $('meta[property="og:title"]').attr('content')?.trim(),
        coverImageUrl: $('meta[property="og:image"]').attr('content')?.trim(),
        description:
          $('meta[name="description"]').attr('content')?.trim() ||
          $('meta[property="og:description"]').attr('content')?.trim(),
        headquarters: undefined,
        industry: undefined,
        logoUrl: this.brandWebsiteParser.extractLogoFromDom($, normalizedUrl),
        recentPosts: [],
        scrapedAt: new Date(),
        sourceUrl: normalizedUrl,
      };

      // Extract sections that may contain industry/employee info
      $('dt, .org-top-card-summary-info-list__info-item').each((_i, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (text.includes('industr')) {
          result.industry = $(el).next().text().trim() || text;
        }
        if (text.includes('employee') || text.match(/\d+.*employee/)) {
          result.employeeCount = text;
        }
      });

      // Extract recent post snippets from structured data
      $('article, [class*="feed-shared-text"]').each((_i, el) => {
        const text = $(el).text().trim();
        if (text.length > 20 && text.length < 500) {
          result.recentPosts.push(text);
        }
      });
      result.recentPosts = result.recentPosts.slice(0, 10);

      this.loggerService.log(`${caller} completed`, {
        companyName: result.companyName,
      });

      return result;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Scrape a public X/Twitter profile for brand information
   */
  async scrapeXProfile(url: string): Promise<XProfileScrapedData> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { url });

    try {
      const normalizedUrl = this.normalizeUrl(url);

      const response = await this.fetchWithRetry(normalizedUrl, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': BROWSER_USER_AGENT,
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch X profile: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract handle from URL
      const handleMatch = normalizedUrl.match(
        /(?:twitter\.com|x\.com)\/([^/?#]+)/,
      );
      const handle = handleMatch?.[1];

      const result: XProfileScrapedData = {
        bannerImageUrl: undefined,
        bio:
          $('meta[name="description"]').attr('content')?.trim() ||
          $('meta[property="og:description"]').attr('content')?.trim(),
        contentStyle: {
          contentTypes: [],
          usesEmojis: false,
          usesHashtags: false,
        },
        displayName:
          $('meta[property="og:title"]').attr('content')?.trim() ||
          $('title').first().text().trim(),
        handle,
        pinnedTweet: undefined,
        profileImageUrl: $('meta[property="og:image"]').attr('content')?.trim(),
        recentTweets: [],
        scrapedAt: new Date(),
        sourceUrl: normalizedUrl,
      };

      // Extract tweets from structured data or article elements
      $('article [data-testid="tweetText"], [class*="tweet-text"]').each(
        (_i, el) => {
          const text = $(el).text().trim();
          if (text.length > 5) {
            result.recentTweets.push(text);
          }
        },
      );
      result.recentTweets = result.recentTweets.slice(0, 10);

      // Analyze content style from scraped tweets
      if (result.recentTweets.length > 0) {
        const allText = result.recentTweets.join(' ');
        result.contentStyle.usesHashtags = allText.includes('#');
        result.contentStyle.usesEmojis =
          /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(
            allText,
          );
        result.contentStyle.avgTweetLength = Math.round(
          result.recentTweets.reduce((sum, t) => sum + t.length, 0) /
            result.recentTweets.length,
        );
      }

      // Parse bio for content style hints
      if (result.bio) {
        if (result.bio.includes('#')) {
          result.contentStyle.usesHashtags = true;
        }
      }

      this.loggerService.log(`${caller} completed`, {
        handle: result.handle,
      });

      return result;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  /**
   * Scrape all provided sources and merge into a unified brand analysis
   */
  async scrapeAllSources(
    sources: BrandScrapeSources,
  ): Promise<MergedBrandAnalysis> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { sources });

    const results = await Promise.allSettled([
      sources.websiteUrl
        ? this.scrapeWebsite(sources.websiteUrl)
        : Promise.resolve(null),
      sources.linkedinUrl
        ? this.scrapeLinkedIn(sources.linkedinUrl)
        : Promise.resolve(null),
      sources.xProfileUrl
        ? this.scrapeXProfile(sources.xProfileUrl)
        : Promise.resolve(null),
    ]);

    const websiteData =
      results[0].status === 'fulfilled' ? results[0].value : null;
    const linkedinData =
      results[1].status === 'fulfilled'
        ? (results[1].value as LinkedInScrapedData | null)
        : null;
    const xData =
      results[2].status === 'fulfilled'
        ? (results[2].value as XProfileScrapedData | null)
        : null;

    // Log any failures
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        const sourceNames = ['website', 'linkedin', 'x'];
        this.loggerService.error(
          `${caller} ${sourceNames[i]} scraping failed`,
          result.reason,
        );
      }
    }

    // Merge data — website takes priority for core brand info,
    // social profiles add content samples and style info
    const contentSamples: string[] = [];
    if (linkedinData?.recentPosts) {
      contentSamples.push(...linkedinData.recentPosts);
    }
    if (xData?.recentTweets) {
      contentSamples.push(...xData.recentTweets);
    }

    const sourceUrls: string[] = [];
    if (sources.websiteUrl) {
      sourceUrls.push(sources.websiteUrl);
    }
    if (sources.linkedinUrl) {
      sourceUrls.push(sources.linkedinUrl);
    }
    if (sources.xProfileUrl) {
      sourceUrls.push(sources.xProfileUrl);
    }

    const merged: MergedBrandAnalysis = {
      aboutText: websiteData?.aboutText,
      audience: undefined,
      companyName:
        websiteData?.companyName ||
        linkedinData?.companyName ||
        xData?.displayName,
      contentSamples,
      contentStyle: xData?.contentStyle
        ? {
            avgPostLength: xData.contentStyle.avgTweetLength,
            tone: undefined,
            usesEmojis: xData.contentStyle.usesEmojis,
            usesHashtags: xData.contentStyle.usesHashtags,
          }
        : undefined,
      description:
        websiteData?.description || linkedinData?.description || xData?.bio,
      fontFamily: websiteData?.fontFamily,
      heroText: websiteData?.heroText,
      industry: linkedinData?.industry,
      logoUrl: websiteData?.logoUrl || linkedinData?.logoUrl,
      primaryColor: websiteData?.primaryColor,
      scrapedAt: new Date(),
      secondaryColor: websiteData?.secondaryColor,
      socialLinks: websiteData?.socialLinks ?? {},
      sourceUrls,
      tagline: websiteData?.tagline,
      valuePropositions: websiteData?.valuePropositions ?? [],
    };

    this.loggerService.log(`${caller} completed`, {
      companyName: merged.companyName,
      sourceCount: sourceUrls.length,
    });

    return merged;
  }

  /**
   * Fetch a URL and parse HTML with cheerio
   */
  private async fetchAndParse(url: string): Promise<WebsiteScrapingResult> {
    const response = await this.fetchWithRetry(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': BROWSER_USER_AGENT,
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      );
    }

    this.brandWebsiteParser.assertHtmlResponse(response);
    const html = await response.text();

    return this.brandWebsiteParser.parseHtml(html, url);
  }

  /**
   * Fetch a URL with retry logic for rate-limited (429) responses.
   * Uses exponential backoff: delay * 2^attempt
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Re-validate EVERY hop, not just the initial URL. A validated public URL
      // can 3xx to a private/loopback/cloud-metadata target, so following
      // redirects blindly (redirect: 'follow') reopens the SSRF hole the
      // initial validateUrl check closed. We follow manually and re-check each
      // Location against the shared blocklist. (Connection-level IP pinning to
      // defeat DNS rebinding of a public hostname is a separate follow-up.)
      this.assertFetchTargetAllowed(currentUrl);

      const response = await this.fetchOnce(currentUrl, options);

      if (
        REDIRECT_STATUS_CODES.has(response.status) &&
        response.headers.has('location')
      ) {
        const location = response.headers.get('location') as string;
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          throw new Error(`Invalid redirect target "${location}" from ${url}`);
        }
        currentUrl = nextUrl;
        continue;
      }

      return response;
    }

    throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`);
  }

  /**
   * Throw if the URL's host is an SSRF target (loopback, RFC-1918, link-local /
   * cloud metadata, internal TLDs). Applied to the initial URL and every
   * redirect hop.
   */
  private assertFetchTargetAllowed(url: string): void {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      throw new Error(`Invalid fetch URL: ${url}`);
    }
    // Throws BadRequestException on a blocked host.
    assertHostNotPrivate(hostname);
  }

  /**
   * Fetch a single URL with 429 backoff. Redirects are NOT auto-followed
   * (redirect: 'manual') so the caller can re-validate each hop.
   */
  private async fetchOnce(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          ...options,
          redirect: 'manual',
          signal: controller.signal,
        });

        if (response.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader
            ? Number.parseInt(retryAfterHeader, 10)
            : 0;
          const backoffMs = Math.max(
            retryAfterSeconds * 1_000,
            RETRY_BASE_DELAY_MS * 2 ** attempt,
          );

          this.loggerService.warn(
            `${caller} rate-limited (429), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`,
            { url },
          );

          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        return response;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Max retries (${MAX_RETRY_ATTEMPTS}) exceeded for ${url}`);
  }

  /**
   * Fallback scraper: fetches only meta tags when full scraping fails.
   * Useful for JS-rendered pages where cheerio can't extract content.
   */
  private async scrapeMetaTagsFallback(
    url: string,
  ): Promise<MetaTagFallbackData> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} attempting meta tag fallback`, { url });

    const response = await this.fetchWithRetry(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': BROWSER_USER_AGENT,
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(
        `Meta tag fallback failed: ${response.status} ${response.statusText}`,
      );
    }

    this.brandWebsiteParser.assertHtmlResponse(response);
    const html = await response.text();
    const $ = cheerio.load(html);

    return {
      description: $('meta[name="description"]').attr('content')?.trim(),
      ogDescription: $('meta[property="og:description"]')
        .attr('content')
        ?.trim(),
      ogImage:
        $('meta[property="og:image"]').attr('content')?.trim() ||
        $(
          'meta[name="twitter:image"], meta[property="twitter:image"], meta[name="twitter:image:src"]',
        )
          .first()
          .attr('content')
          ?.trim(),
      ogTitle: $('meta[property="og:title"]').attr('content')?.trim(),
      scrapedAt: new Date(),
      siteName: $('meta[property="og:site_name"]').attr('content')?.trim(),
      sourceUrl: url,
      title: $('title').first().text().trim() || undefined,
    };
  }

  /**
   * Normalize URL to ensure it has protocol
   */
  private normalizeUrl(url: string): string {
    let normalized = url.trim();

    if (
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://')
    ) {
      normalized = `https://${normalized}`;
    }

    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Detect URL type and return the appropriate BrandScrapeSources routing.
   * If the URL is LinkedIn, it goes to linkedinUrl. If X/Twitter, to xProfileUrl.
   * Otherwise it's treated as a regular websiteUrl.
   */
  detectUrlType(url: string): BrandScrapeSources {
    const normalized = this.normalizeUrl(url).toLowerCase();

    if (normalized.includes('linkedin.com')) {
      return { linkedinUrl: url };
    }

    if (normalized.includes('x.com') || normalized.includes('twitter.com')) {
      return { xProfileUrl: url };
    }

    return { websiteUrl: url };
  }

  /**
   * Validate URL format
   */
  validateUrl(url: string): { isValid: boolean; error?: string } {
    try {
      const normalized = this.normalizeUrl(url);
      const parsedUrl = new URL(normalized);

      if (!parsedUrl.hostname.includes('.')) {
        return { error: 'Invalid domain', isValid: false };
      }

      // Shared SSRF blocklist: loopback, RFC-1918, link-local/cloud
      // metadata, internal TLDs. The previous three-string check left
      // 169.254.169.254 and all private ranges fetchable.
      try {
        assertHostNotPrivate(parsedUrl.hostname);
      } catch {
        return { error: 'Local URLs are not allowed', isValid: false };
      }

      return { isValid: true };
    } catch {
      return { error: 'Invalid URL format', isValid: false };
    }
  }
}
