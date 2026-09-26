import { BrandScrapeErrorCode } from '@genfeedai/contracts';

const KNOWN_CODES = new Set<string>(Object.values(BrandScrapeErrorCode));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the stable `BrandScrapeErrorCode` a rejected `/brands/:id/scrape`
 * request carries in its JSON:API error body (`{ errors: [{ code, ... }] }`),
 * as written by `HttpExceptionFilter` (#5080). Anything unrecognized —
 * network failures, cancellations, a body shape from before this contract —
 * resolves to `undefined` so the caller can fall back to a generic message.
 */
export function extractBrandScrapeErrorCode(
  error: unknown,
): string | undefined {
  if (!isRecord(error) || !Array.isArray(error.errors)) {
    return undefined;
  }
  const first = error.errors[0];
  return isRecord(first) && typeof first.code === 'string'
    ? first.code
    : undefined;
}

/**
 * Normalizes any code (from a thrown error, or from a successful response's
 * `scrapeWarning.code`) to a known `BrandScrapeErrorCode`, falling back to
 * `UNKNOWN` for anything this build does not recognize yet.
 */
export function resolveBrandScrapeIssueCode(
  code: string | undefined,
): BrandScrapeErrorCode {
  return code && KNOWN_CODES.has(code)
    ? (code as BrandScrapeErrorCode)
    : BrandScrapeErrorCode.UNKNOWN;
}
