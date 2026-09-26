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

/**
 * The HTTP interceptor (`packages/services/core/interceptor.service.ts`)
 * rejects a client-side timeout (the fixed `HTTP_REQUEST_TIMEOUT_MS`, which
 * a slow scrape + AI pipeline can exceed even though the server keeps
 * working) with a plain `Error` carrying `isTimeout: true` — never a
 * JSON:API body. Without this check that case falls through to `UNKNOWN`,
 * which reads as a harder failure than "we just stopped waiting" (#5080
 * review).
 */
function isClientTimeoutError(error: unknown): boolean {
  return isRecord(error) && error.isTimeout === true;
}

/**
 * Resolves a `BrandScrapeErrorCode` directly from a rejected
 * `brandsService.scrape(...)` call: the server's JSON:API code first, then
 * the client-side timeout case, then `UNKNOWN`.
 */
export function resolveScrapeIssueCodeFromError(
  error: unknown,
): BrandScrapeErrorCode {
  const serverCode = extractBrandScrapeErrorCode(error);
  if (serverCode) {
    return resolveBrandScrapeIssueCode(serverCode);
  }

  return isClientTimeoutError(error)
    ? BrandScrapeErrorCode.TIMEOUT
    : BrandScrapeErrorCode.UNKNOWN;
}
