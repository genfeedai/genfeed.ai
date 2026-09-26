/**
 * Stable, non-generic classification for a brand-scrape failure.
 *
 * Backs `POST /brands/:id/scrape` (issue #5080): the scrape step degrades
 * gracefully (onboarding always continues with a fallback brand profile), but
 * the reason for the degradation must survive the API → app boundary as a
 * stable code instead of collapsing into an opaque 500 or a silently dropped
 * warning. Values are wire contracts — never change or scramble.
 */
export enum BrandScrapeErrorCode {
  /** The submitted brand URL failed validation before any scrape attempt. */
  INVALID_URL = 'BRAND_SCRAPE_INVALID_URL',
  /** DNS/connection failure, or the host never responded. */
  SITE_UNREACHABLE = 'BRAND_SCRAPE_SITE_UNREACHABLE',
  /** The site returned a bot-blocking status (403/999) or a robots.txt style refusal. */
  SITE_BLOCKED = 'BRAND_SCRAPE_SITE_BLOCKED',
  /** The fetch did not complete before the scrape timeout elapsed. */
  TIMEOUT = 'BRAND_SCRAPE_TIMEOUT',
  /** A dependency the scrape relies on (e.g. LinkedIn/X) returned an error. */
  UPSTREAM_PROVIDER_ERROR = 'BRAND_SCRAPE_UPSTREAM_PROVIDER_ERROR',
  /** The page fetched successfully but had no analyzable brand content. */
  EMPTY_CONTENT = 'BRAND_SCRAPE_EMPTY_CONTENT',
  /** Unclassified failure. Diagnostics are protected; only this code is public. */
  UNKNOWN = 'BRAND_SCRAPE_UNKNOWN',
}
