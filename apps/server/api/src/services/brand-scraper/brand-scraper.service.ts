import { assertHostNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import type {
  BrandScrapeSources,
  LinkedInScrapedData,
  MergedBrandAnalysis,
  MetaTagFallbackData,
  WebsiteBrandScrapeEvidence,
  WebsiteFetchBudget,
  WebsiteResponseState,
  WebsiteScrapingResult,
  WebsiteStylesheetByteBudget,
  WebsiteStylesheetEvidence,
  XProfileScrapedData,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type {
  IBrandKitDiagnostic,
  IExtractedBrandData,
  IScrapedBrandData,
  IScrapedImageCandidate,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { buildLogoDevLogoUrl } from './logo-dev-logo.util';

const FETCH_TIMEOUT_MS = 10_000;
const WEBSITE_TIMEOUT_MS = 60_000;
const MAX_STYLESHEETS = 5;
const MAX_CSS_BYTES = 262_144;
const MAX_TOTAL_CSS_BYTES = 1_048_576;

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
  private readonly websiteResponses = new WeakMap<
    Response,
    WebsiteResponseState
  >();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandWebsiteParser: BrandWebsiteParserService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Scrape a website URL and extract brand information
   */
  async scrapeWebsite(url: string): Promise<IScrapedBrandData> {
    return (await this.scrapeWebsiteWithEvidence(url)).data;
  }

  async scrapeWebsiteWithEvidence(
    url: string,
  ): Promise<WebsiteBrandScrapeEvidence> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeUrl(url);
    const budget: WebsiteFetchBudget = {
      deadlineAt: performance.now() + WEBSITE_TIMEOUT_MS,
    };
    this.loggerService.log(`${caller} starting`, {
      url: this.brandWebsiteParser.sanitizeProvenanceUrl(normalizedUrl),
    });

    try {
      const rawContent = await this.fetchAndParse(normalizedUrl, budget);
      const scrapedData = this.brandWebsiteParser.extractBrandData(
        rawContent,
        normalizedUrl,
      );
      scrapedData.logoUrl = this.resolveWebsiteLogoUrl(
        scrapedData.logoUrl,
        normalizedUrl,
      );
      scrapedData.logoCandidates = this.resolveWebsiteLogoCandidates(
        scrapedData.logoCandidates,
        normalizedUrl,
      );

      this.loggerService.log(`${caller} completed`, {
        companyName: scrapedData.companyName,
        url: this.brandWebsiteParser.sanitizeProvenanceUrl(normalizedUrl),
      });

      return {
        data: scrapedData,
        evidence: rawContent.evidence ?? [],
        diagnostics: rawContent.diagnostics ?? [],
        fontCandidates: rawContent.fontDetails ?? [],
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        `${caller} full scrape failed, falling back to meta tags`,
        { url: this.brandWebsiteParser.sanitizeProvenanceUrl(normalizedUrl) },
      );

      try {
        const fallback = await this.scrapeMetaTagsFallback(
          normalizedUrl,
          budget,
        );
        const companyName = this.brandWebsiteParser.extractCompanyName(
          fallback.title,
          fallback.ogTitle,
        );
        const logoCandidates = this.resolveWebsiteLogoCandidates(
          [],
          normalizedUrl,
        );

        const data: IScrapedBrandData = {
          aboutText: undefined,
          bannerUrl: fallback.ogImage,
          companyName: companyName || fallback.siteName,
          description: fallback.description || fallback.ogDescription,
          fontCandidates: [],
          fontFamily: undefined,
          heroText: undefined,
          logoCandidates,
          logoUrl: logoCandidates[0]?.url,
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
        return {
          data,
          evidence: [
            {
              sourceType: 'website',
              label: 'Website meta fallback',
              url: this.brandWebsiteParser.sanitizeProvenanceUrl(normalizedUrl),
            },
          ],
          diagnostics: [
            this.diagnostic(
              'html_fallback',
              'Full HTML extraction failed; meta tags were used.',
            ),
          ],
          fontCandidates: [],
        };
      } catch (fallbackError: unknown) {
        this.loggerService.error(
          `${caller} meta tag fallback also failed`,
          fallbackError instanceof Error
            ? fallbackError.name
            : 'Fallback failed',
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
    this.loggerService.log(`${caller} starting`, {
      url: this.brandWebsiteParser.sanitizeProvenanceUrl(
        this.normalizeUrl(url),
      ),
    });

    try {
      const scrapedData = await this.scrapeWebsite(url);

      return {
        ...scrapedData,
        brandVoice: undefined,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${caller} failed`,
        error instanceof Error ? error.name : 'Website scrape failed',
      );
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
    this.loggerService.log(`${caller} starting`, {
      sources: {
        ...sources,
        websiteUrl: sources.websiteUrl
          ? this.brandWebsiteParser.sanitizeProvenanceUrl(
              this.normalizeUrl(sources.websiteUrl),
            )
          : undefined,
      },
    });

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
          i === 0 ? 'Website scrape failed' : result.reason,
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
  private async fetchAndParse(
    url: string,
    budget: WebsiteFetchBudget,
  ): Promise<WebsiteScrapingResult> {
    const response = await this.fetchWithRetry(
      url,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': BROWSER_USER_AGENT,
        },
        redirect: 'follow',
      },
      budget,
    );
    const pageUrl = this.websiteResponses.get(response)?.url ?? url;
    let html: string;
    try {
      if (!response.ok)
        throw new Error(`Failed to fetch website: ${response.status}`);
      this.brandWebsiteParser.assertHtmlResponse(response);
      html = await this.readWebsiteBody(response, budget);
    } finally {
      await this.releaseWebsiteResponse(response);
    }
    // Parse usable HTML first. Enrichment failures cannot activate the HTML fallback.
    const parsed = this.brandWebsiteParser.parseHtml(html, pageUrl);
    const stylesheetUrls = this.brandWebsiteParser.extractStylesheetUrls(
      html,
      pageUrl,
    );
    const diagnostics: IBrandKitDiagnostic[] = [];
    const stylesheets: WebsiteStylesheetEvidence[] = [];
    const total = { bytes: 0 };
    if (stylesheetUrls.length > MAX_STYLESHEETS)
      diagnostics.push(
        this.diagnostic(
          'stylesheet_count_limit',
          'Only the first five stylesheets are fetched.',
        ),
      );
    for (const sheetUrl of stylesheetUrls.slice(0, MAX_STYLESHEETS)) {
      if (total.bytes >= MAX_TOTAL_CSS_BYTES) {
        diagnostics.push(
          this.diagnostic(
            'stylesheet_total_limit',
            'Aggregate stylesheet byte limit reached.',
          ),
        );
        break;
      }
      let sheetResponse: Response | undefined;
      try {
        sheetResponse = await this.fetchWithRetry(
          sheetUrl,
          { headers: { Accept: 'text/css', 'User-Agent': BROWSER_USER_AGENT } },
          budget,
        );
        if (!sheetResponse.ok) throw new Error('stylesheet_failed');
        if (
          !/^text\/css(?:\s*;|\s*$)/i.test(
            sheetResponse.headers.get('content-type') ?? '',
          )
        )
          throw new Error('stylesheet_content_type');
        const length = Number(sheetResponse.headers.get('content-length'));
        if (Number.isFinite(length) && length > MAX_CSS_BYTES)
          throw new Error('stylesheet_size_limit');
        const cssText = await this.readWebsiteBody(
          sheetResponse,
          budget,
          total,
        );
        stylesheets.push({
          url: this.websiteResponses.get(sheetResponse)?.url ?? sheetUrl,
          cssText,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '';
        const code =
          performance.now() >= budget.deadlineAt ||
          message === 'deadline_exceeded'
            ? 'deadline_exceeded'
            : /^stylesheet_(content_type|size_limit|total_limit)$/.test(message)
              ? message
              : /Too many redirects/.test(message)
                ? 'stylesheet_redirect_limit'
                : /blocked|private|unsafe|Invalid redirect|Unsupported stylesheet URL/i.test(
                      message,
                    )
                  ? 'stylesheet_unsafe'
                  : 'stylesheet_failed';
        diagnostics.push(
          this.diagnostic(code, 'Stylesheet enrichment omitted a source.'),
        );
        parsed.evidence?.push({
          sourceType: 'website',
          label: 'Omitted stylesheet',
          url: this.brandWebsiteParser.sanitizeProvenanceUrl(sheetUrl),
        });
        if (code === 'deadline_exceeded' || total.bytes >= MAX_TOTAL_CSS_BYTES)
          break;
      } finally {
        if (sheetResponse) await this.releaseWebsiteResponse(sheetResponse);
      }
    }
    const enriched = stylesheets.length
      ? this.brandWebsiteParser.parseHtml(html, pageUrl, stylesheets)
      : parsed;
    enriched.evidence = [
      ...(enriched.evidence ?? []),
      ...(parsed.evidence ?? []).filter(
        (item) => item.label === 'Omitted stylesheet',
      ),
      ...stylesheets.map((sheet) => ({
        sourceType: 'website' as const,
        label: 'Website stylesheet',
        url: this.brandWebsiteParser.sanitizeProvenanceUrl(sheet.url),
      })),
    ];
    enriched.diagnostics = [...(enriched.diagnostics ?? []), ...diagnostics];
    enriched.stylesheetUrls = stylesheetUrls.slice(0, MAX_STYLESHEETS);
    return enriched;
  }

  private diagnostic(code: string, message: string): IBrandKitDiagnostic {
    return { code: `brand_scrape.${code}`, severity: 'warning', message };
  }

  private remainingBudget(budget: WebsiteFetchBudget): number {
    const remaining = budget.deadlineAt - performance.now();
    if (remaining <= 0) throw new Error('deadline_exceeded');
    return remaining;
  }

  private async releaseWebsiteResponse(response: Response): Promise<void> {
    const state = this.websiteResponses.get(response);
    if (!state) return;
    clearTimeout(state.timeout);
    state.controller.abort();
    this.websiteResponses.delete(response);
    if (response.body && !response.body.locked)
      void response.body.cancel().catch(() => undefined);
  }

  private async readWebsiteBody(
    response: Response,
    budget: WebsiteFetchBudget,
    total?: WebsiteStylesheetByteBudget,
  ): Promise<string> {
    const state = this.websiteResponses.get(response);
    const remaining = Math.min(
      this.remainingBudget(budget),
      (state?.deadlineAt ?? budget.deadlineAt) - performance.now(),
    );
    if (remaining <= 0) throw new Error('deadline_exceeded');
    if (!response.body) return '';
    const reader = response.body.getReader();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        state?.controller.abort();
        reject(
          new Error(
            performance.now() >= budget.deadlineAt
              ? 'deadline_exceeded'
              : 'stylesheet_failed',
          ),
        );
      }, remaining);
    });
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    let complete = false;
    try {
      while (true) {
        const chunk = await Promise.race([reader.read(), expired]);
        if (chunk.done) {
          complete = true;
          return text + decoder.decode();
        }
        bytes += chunk.value.byteLength;
        if (total) {
          total.bytes += chunk.value.byteLength;
          if (total.bytes >= MAX_TOTAL_CSS_BYTES)
            throw new Error('stylesheet_total_limit');
          if (bytes > MAX_CSS_BYTES) throw new Error('stylesheet_size_limit');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      if (!complete) void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }

  /**
   * Fetch a URL with retry logic for rate-limited (429) responses.
   * Uses exponential backoff: delay * 2^attempt
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    budget?: WebsiteFetchBudget,
  ): Promise<Response> {
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (budget) {
        this.remainingBudget(budget);
        const target = new URL(currentUrl);
        if (
          !['http:', 'https:'].includes(target.protocol) ||
          target.username ||
          target.password
        )
          throw new Error('Unsupported stylesheet URL');
      }
      const response = await this.fetchOnce(currentUrl, options, budget);

      if (
        REDIRECT_STATUS_CODES.has(response.status) &&
        response.headers.has('location')
      ) {
        const location = response.headers.get('location') as string;
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).href;
        } catch {
          if (budget) await this.releaseWebsiteResponse(response);
          throw new Error(
            budget
              ? 'Invalid redirect target'
              : `Invalid redirect target "${location}" from ${url}`,
          );
        }
        if (budget) await this.releaseWebsiteResponse(response);
        currentUrl = nextUrl;
        continue;
      }

      if (budget) {
        const state = this.websiteResponses.get(response);
        if (state) state.url = response.url || currentUrl;
      }
      return response;
    }

    throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`);
  }

  /**
   * Fetch a single URL with 429 backoff. Redirects are NOT auto-followed
   * (redirect: 'manual') so the retry loop owns hop accounting. `safeFetch`
   * resolves, validates, and pins every current URL before connecting.
   */
  private async fetchOnce(
    url: string,
    options: RequestInit,
    budget?: WebsiteFetchBudget,
  ): Promise<Response> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const duration = budget
        ? Math.min(FETCH_TIMEOUT_MS, this.remainingBudget(budget))
        : FETCH_TIMEOUT_MS;
      const deadlineAt = performance.now() + duration;
      let rejectExpired: ((error: Error) => void) | undefined;
      const expired = new Promise<never>((_resolve, reject) => {
        rejectExpired = reject;
      });
      const timeout = setTimeout(() => {
        controller.abort();
        if (budget)
          rejectExpired?.(
            new Error(
              performance.now() >= budget.deadlineAt
                ? 'deadline_exceeded'
                : 'Fetch timeout',
            ),
          );
      }, duration);
      let retained = false;

      try {
        const pending = safeFetch(url, {
          ...options,
          redirect: 'manual',
          signal: controller.signal,
        });
        const response = budget
          ? await Promise.race([pending, expired])
          : await pending;

        if (response.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const parsedRetryAfter = retryAfterHeader
            ? budget
              ? Number(retryAfterHeader)
              : Number.parseInt(retryAfterHeader, 10)
            : 0;
          const retryAfterSeconds = budget
            ? Number.isFinite(parsedRetryAfter) && parsedRetryAfter >= 0
              ? parsedRetryAfter
              : 0
            : parsedRetryAfter;
          const backoffMs = Math.max(
            retryAfterSeconds * 1_000,
            RETRY_BASE_DELAY_MS * 2 ** attempt,
          );

          if (budget) {
            void response.body?.cancel().catch(() => undefined);
            clearTimeout(timeout);
            if (backoffMs >= this.remainingBudget(budget))
              throw new Error('Retry delay exceeds remaining budget');
          }
          this.loggerService.warn(
            `${caller} rate-limited (429), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`,
            {
              url: budget
                ? this.brandWebsiteParser.sanitizeProvenanceUrl(url)
                : url,
            },
          );

          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        if (budget) {
          this.websiteResponses.set(response, {
            deadlineAt,
            controller,
            timeout,
            url,
          });
          retained = true;
        }
        return response;
      } finally {
        if (!retained) clearTimeout(timeout);
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
    budget?: WebsiteFetchBudget,
  ): Promise<MetaTagFallbackData> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} attempting meta tag fallback`, {
      url: this.brandWebsiteParser.sanitizeProvenanceUrl(url),
    });

    const response = await this.fetchWithRetry(
      url,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': BROWSER_USER_AGENT,
        },
        redirect: 'follow',
      },
      budget,
    );

    let html: string;
    try {
      if (!response.ok)
        throw new Error(`Meta tag fallback failed: ${response.status}`);
      this.brandWebsiteParser.assertHtmlResponse(response);
      html = budget
        ? await this.readWebsiteBody(response, budget)
        : await response.text();
    } finally {
      if (budget) await this.releaseWebsiteResponse(response);
    }
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
   * Preserve a scraper-discovered logo and consult Logo.dev only when the
   * website supplied none. URL generation is synchronous and non-blocking;
   * downstream image/import errors retain their existing placeholder paths.
   */
  private resolveWebsiteLogoUrl(
    scrapedLogoUrl: string | undefined,
    sourceUrl: string,
  ): string | undefined {
    if (scrapedLogoUrl) {
      return scrapedLogoUrl;
    }

    return buildLogoDevLogoUrl(
      sourceUrl,
      this.configService.get('LOGO_DEV_PUBLISHABLE_KEY'),
    );
  }

  /**
   * Every logo worth trying, best first, ending with Logo.dev. Unlike
   * `logoUrl`, Logo.dev stays in the chain behind a page logo, because a page
   * logo is often an SVG the brand-kit importer cannot store.
   */
  private resolveWebsiteLogoCandidates(
    scrapedCandidates: IScrapedImageCandidate[] | undefined,
    sourceUrl: string,
  ): IScrapedImageCandidate[] {
    const logoDevUrl = buildLogoDevLogoUrl(
      sourceUrl,
      this.configService.get('LOGO_DEV_PUBLISHABLE_KEY'),
    );
    const candidates = scrapedCandidates ?? [];

    // The Logo.dev URL requests `format=png` but has no file extension.
    return logoDevUrl && !candidates.some(({ url }) => url === logoDevUrl)
      ? [...candidates, { mimeType: 'image/png', url: logoDevUrl }]
      : candidates;
  }

  /**
   * Detect URL type and return the appropriate BrandScrapeSources routing.
   * If the URL is LinkedIn, it goes to linkedinUrl. If X/Twitter, to xProfileUrl.
   * Otherwise it's treated as a regular websiteUrl.
   */
  detectUrlType(url: string): BrandScrapeSources {
    const hostname = this.hostnameOf(url);

    if (hostname && this.hostnameMatches(hostname, 'linkedin.com')) {
      return { linkedinUrl: url };
    }

    if (
      hostname &&
      (this.hostnameMatches(hostname, 'x.com') ||
        this.hostnameMatches(hostname, 'twitter.com'))
    ) {
      return { xProfileUrl: url };
    }

    return { websiteUrl: url };
  }

  private hostnameOf(url: string): string | undefined {
    try {
      return new URL(this.normalizeUrl(url)).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  private hostnameMatches(hostname: string, domain: string): boolean {
    return hostname === domain || hostname.endsWith(`.${domain}`);
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
