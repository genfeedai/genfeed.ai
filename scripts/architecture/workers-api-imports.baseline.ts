/**
 * Ratchet baseline for check-no-api-imports-in-workers.ts (#1090 / #1347).
 *
 * Empty: workers must not import `@api/*`. Any specifier fails the guard.
 */

export const WORKERS_API_IMPORT_BASELINE: readonly string[] = [];
