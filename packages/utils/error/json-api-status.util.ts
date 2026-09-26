import type { AxiosError } from 'axios';

/**
 * Dependency-free JSON:API / HTTP status resolution.
 *
 * `error-handler.util.ts` re-exports everything here for its existing
 * frontend consumers, but this module itself must never import anything
 * beyond `axios` types — a backend spec that only needs to resolve a status
 * (e.g. `http-exception.filter.client-contract.spec.ts`) imports straight
 * from here instead of pulling in `error-handler.util.ts`'s frontend-only
 * `@genfeedai/services/core/logger.service` / `notifications.service`
 * imports, which apps/server/api's typecheck program cannot resolve
 * (TS2307 — #5199 CI).
 */

/** Minimal axios error response shape used only to resolve an HTTP status. */
export interface IApiErrorResponse {
  message?: string;
  detail?: string;
  error?: string;
  statusCode?: number;
  errors?: Array<{ field: string; message: string }>;
  [key: string]: unknown;
}

export function isAxiosError(
  error: unknown,
): error is AxiosError<IApiErrorResponse> {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

export function parseHttpStatusCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return undefined;
}

export interface IJsonApiError {
  errors: Array<{
    /**
     * A stable, non-generic code (e.g. `BrandScrapeErrorCode`), or the HTTP
     * status as a fallback on older responses that never set `status`
     * separately. Read `status` first — `code` is not guaranteed to be
     * status-shaped (#5080 review).
     */
    code: number | string;
    title: string;
    detail: string;
    /** HTTP status as number or string (`404` / `"404"`). */
    status?: number | string;
    source?: { pointer?: string; parameter?: string };
    meta?: Record<string, unknown>;
  }>;
}

/**
 * The HTTP status a JSON:API error document carries for its first error
 * member. `status` first — `code` may be a stable, non-numeric identifier
 * such as `BrandScrapeErrorCode` rather than the HTTP status (#5080 review).
 */
export function getJsonApiErrorStatus(
  jsonApiError: IJsonApiError,
): number | undefined {
  const firstError = jsonApiError.errors?.[0];
  if (!firstError) {
    return undefined;
  }

  return (
    parseHttpStatusCode(firstError.status) ??
    parseHttpStatusCode(firstError.code)
  );
}

/**
 * Resolve an HTTP status from the shapes this monorepo actually throws:
 * - Axios errors (`response.status`)
 * - Sanitized interceptor Errors with `.status`
 * - Raw JSON:API documents the interceptor re-throws in development
 *   (`{ errors: [{ code: '404' | 404 }] }`)
 *
 * Without the JSON:API branch, expected 404s (e.g. missing editor projects)
 * fall through as unhandled errors → `logger.error` → Next.js dev overlay.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (isAxiosError(error)) {
    return error.response?.status;
  }

  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;

  const directStatus = parseHttpStatusCode(record.status);
  if (directStatus !== undefined) {
    return directStatus;
  }

  const response = record.response as { status?: unknown } | undefined;
  const nestedStatus = parseHttpStatusCode(response?.status);
  if (nestedStatus !== undefined) {
    return nestedStatus;
  }

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    return getJsonApiErrorStatus(record as unknown as IJsonApiError);
  }

  return undefined;
}
