import type {
  WebsiteFetchBudget,
  WebsiteResponseState,
  WebsiteStylesheetByteBudget,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { CallerUtil } from '@libs/utils/caller/caller.util';

const FETCH_TIMEOUT_MS = 10_000;
export const MAX_CSS_BYTES = 262_144;
export const MAX_TOTAL_CSS_BYTES = 1_048_576;
export const MAX_HTML_BYTES = 3_145_728;

/** Maximum number of retry attempts for rate-limited (429) requests */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay in ms for exponential backoff on 429 responses */
const RETRY_BASE_DELAY_MS = 1_000;

/** Maximum redirect hops followed (each re-validated against the SSRF blocklist) */
const MAX_REDIRECTS = 5;

/** HTTP status codes we follow as redirects (re-validating each Location) */
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export interface BrandScraperHttpOptions {
  logger: Pick<LoggerService, 'warn'>;
  sanitizeProvenanceUrl: (value: string) => string | undefined;
  callerName: string;
}

export class BrandScraperHttp {
  private readonly websiteResponses = new WeakMap<
    Response,
    WebsiteResponseState
  >();

  constructor(private readonly options: BrandScraperHttpOptions) {}

  responseUrl(response: Response, fallback: string): string {
    return this.websiteResponses.get(response)?.url ?? fallback;
  }

  private remainingBudget(budget: WebsiteFetchBudget): number {
    const remaining = budget.deadlineAt - performance.now();
    if (remaining <= 0) throw new Error('deadline_exceeded');
    return remaining;
  }

  async releaseWebsiteResponse(response: Response): Promise<void> {
    const state = this.websiteResponses.get(response);
    if (!state) return;
    clearTimeout(state.timeout);
    state.controller.abort();
    this.websiteResponses.delete(response);
    if (response.body && !response.body.locked)
      void response.body.cancel().catch(() => undefined);
  }

  async readWebsiteBody(
    response: Response,
    budget: WebsiteFetchBudget,
    total?: WebsiteStylesheetByteBudget,
    maxBytes?: number,
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
        if (maxBytes !== undefined && bytes > maxBytes)
          throw new Error('html_size_limit');
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
  async fetchWithRetry(
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
    const caller = `${this.options.callerName} ${CallerUtil.getCallerName()}`;

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
          this.options.logger.warn(
            `${caller} rate-limited (429), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`,
            {
              url: budget ? this.options.sanitizeProvenanceUrl(url) : url,
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
}
