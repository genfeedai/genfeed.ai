/**
 * Test-only replacement for `@sentry/nextjs`. The real package root resolves to
 * the server entry, which since 10.73 loads a webpack plugin at import time and
 * throws outside a file:// URL; the client entry in turn requires `next/router`,
 * which is not resolvable from the hoisted layout on CI. Every vitest config
 * aliases the package here so jsdom suites never touch either bundle.
 */
export type CaptureContext = Record<string, unknown>;

export function captureException(
  _exception: unknown,
  _context?: CaptureContext,
): string {
  return '';
}

export function captureMessage(
  _message: string,
  _context?: CaptureContext,
): string {
  return '';
}

export function addBreadcrumb(_breadcrumb: unknown): void {}
