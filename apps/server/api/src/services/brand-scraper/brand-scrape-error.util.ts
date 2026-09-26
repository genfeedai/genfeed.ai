import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import type {
  IBrandScrapeWarning,
  IScrapedBrandData,
} from '@genfeedai/contracts/interfaces';

/**
 * Network-transport error codes Node/undici attach to a failed fetch. Every
 * one of these means the target host never answered.
 */
const UNREACHABLE_TRANSPORT_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** Status codes a site (or a CDN/WAF in front of it) uses to refuse a bot. */
const BLOCKED_STATUS_CODES = new Set([401, 403, 429, 999]);

const BLOCKED_MESSAGE_PATTERN =
  /forbidden|blocked|bot detection|captcha|access denied|cloudflare|are you a robot/i;

/**
 * `fetchOnce` in `brand-scraper.service.ts` gives up after
 * `MAX_RETRY_ATTEMPTS` consecutive 429s and throws this message — the site
 * itself is the one repeatedly rate-limiting us, so this is a block, not an
 * unclassified failure (#5080 review).
 */
const MAX_RETRIES_MESSAGE_PATTERN = /max retries.*exceeded/i;

/**
 * `resolveSafeDestination` in `destination-guard.ts` throws this specific
 * `DestinationGuardError` message on a DNS lookup failure — that is the site
 * being unreachable, not this guard actively blocking it (#5080 review).
 */
const DESTINATION_DID_NOT_RESOLVE_PATTERN = /did not resolve/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorName(error: unknown): string | undefined {
  return isRecord(error) && typeof error.name === 'string'
    ? error.name
    : undefined;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return isRecord(error) && typeof error.message === 'string'
    ? error.message
    : String(error);
}

/**
 * Node/undici nests the transport code on `error.cause.code` for a
 * `TypeError: fetch failed`; some runtimes set `error.code` directly.
 */
function readTransportCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  if (typeof error.code === 'string') {
    return error.code;
  }
  const cause = error.cause;
  return isRecord(cause) && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

/**
 * Extracts the HTTP status the scraper embedded in its own error message —
 * always as `<prefix>: <status>[ <statusText>]` at the very end of the
 * message (see the `Failed to fetch ...`, `Meta tag fallback failed ...`
 * throws in `brand-scraper.service.ts`). Anchored to the end of the string
 * so a 3-digit port in the URL portion of the message (e.g.
 * `https://example.com:800/path: 404 Not Found`) can never match instead of
 * the real trailing status (#5080 review).
 */
function readEmbeddedStatus(message: string): number | undefined {
  const match = /:\s*(\d{3})(?:\s+\S.*)?$/.exec(message);
  const status = match ? Number(match[1]) : undefined;
  return status !== undefined && Number.isFinite(status) ? status : undefined;
}

function isTimeoutError(error: unknown): boolean {
  const name = readErrorName(error);
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true;
  }
  return /timed out|timeout/i.test(readErrorMessage(error));
}

function isDestinationGuardError(error: unknown): boolean {
  return readErrorName(error) === 'DestinationGuardError';
}

/**
 * Classify a scrape-time failure into a stable, non-generic
 * `BrandScrapeErrorCode`. Every branch here maps to an EXPECTED upstream or
 * input condition (issue #5080's EARS list); anything that does not match
 * falls through to `UNKNOWN` so the caller can keep full diagnostics
 * server-side while returning only this safe classification to the client.
 */
export function classifyBrandScrapeError(error: unknown): IBrandScrapeWarning {
  const message = readErrorMessage(error);

  if (isTimeoutError(error)) {
    return {
      code: BrandScrapeErrorCode.TIMEOUT,
      message: 'The site took too long to respond.',
    };
  }

  const transportCode = readTransportCode(error);
  if (transportCode && UNREACHABLE_TRANSPORT_CODES.has(transportCode)) {
    return {
      code: BrandScrapeErrorCode.SITE_UNREACHABLE,
      message: 'We could not reach that website.',
    };
  }

  if (isDestinationGuardError(error)) {
    // A DNS lookup failure inside the SSRF guard means the site never
    // resolved at all — unreachable, not blocked.
    if (DESTINATION_DID_NOT_RESOLVE_PATTERN.test(message)) {
      return {
        code: BrandScrapeErrorCode.SITE_UNREACHABLE,
        message: 'We could not reach that website.',
      };
    }
    return {
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website could not be accessed for scraping.',
    };
  }

  if (MAX_RETRIES_MESSAGE_PATTERN.test(message)) {
    // Every attempt in `fetchOnce`'s retry loop was rate-limited (429) —
    // the site itself is the one repeatedly refusing us.
    return {
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website blocked our request to read it.',
    };
  }

  const status = readEmbeddedStatus(message);
  if (status !== undefined) {
    if (BLOCKED_STATUS_CODES.has(status)) {
      return {
        code: BrandScrapeErrorCode.SITE_BLOCKED,
        message: 'That website blocked our request to read it.',
      };
    }
    if (status >= 500) {
      return {
        code: BrandScrapeErrorCode.UPSTREAM_PROVIDER_ERROR,
        message: 'That website is temporarily unavailable.',
      };
    }
    if (status >= 400) {
      return {
        code: BrandScrapeErrorCode.SITE_UNREACHABLE,
        message: 'We could not reach that website.',
      };
    }
  }

  if (BLOCKED_MESSAGE_PATTERN.test(message)) {
    return {
      code: BrandScrapeErrorCode.SITE_BLOCKED,
      message: 'That website blocked our request to read it.',
    };
  }

  return {
    code: BrandScrapeErrorCode.UNKNOWN,
    message: 'We could not analyze that website.',
  };
}

/**
 * Content-level check for a *successful* fetch that yielded nothing usable.
 * Distinct from `classifyBrandScrapeError` because no exception is thrown —
 * the scraper returns a well-formed but empty `IScrapedBrandData`.
 */
export function isBrandScrapeContentEmpty(data: IScrapedBrandData): boolean {
  return !(
    data.companyName?.trim() ||
    data.description?.trim() ||
    data.aboutText?.trim() ||
    data.heroText?.trim() ||
    data.tagline?.trim() ||
    (data.valuePropositions?.length ?? 0) > 0
  );
}

export const BRAND_SCRAPE_EMPTY_CONTENT_WARNING: IBrandScrapeWarning = {
  code: BrandScrapeErrorCode.EMPTY_CONTENT,
  message: "That website didn't have enough content for us to extract.",
};
