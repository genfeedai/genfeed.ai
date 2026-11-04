import type { ConfigService } from '@libs/config/config.service';

function toOrigin(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * Origins a Stripe checkout may send the buyer back to: the configured app and
 * public site. Anything else would let a caller of a public checkout endpoint
 * redirect the buyer (and the `{CHECKOUT_SESSION_ID}` in the URL) to a host
 * they control.
 */
export function getCheckoutRedirectBaseUrls(
  configService: ConfigService,
): Array<string | undefined> {
  return [
    configService.get('GENFEEDAI_APP_URL'),
    configService.get('GENFEEDAI_PUBLIC_URL'),
  ];
}

/**
 * Returns `requestedUrl` when its origin matches one of `allowedBaseUrls`,
 * otherwise `fallbackUrl`.
 */
export function resolveAllowedRedirectUrl(
  requestedUrl: string | undefined,
  fallbackUrl: string,
  allowedBaseUrls: ReadonlyArray<string | undefined>,
): string {
  const requestedOrigin = toOrigin(requestedUrl);

  if (!requestedUrl || !requestedOrigin) {
    return fallbackUrl;
  }

  const allowedOrigins = new Set(
    allowedBaseUrls
      .map((url) => toOrigin(url))
      .filter((origin): origin is string => Boolean(origin)),
  );

  return allowedOrigins.has(requestedOrigin) ? requestedUrl : fallbackUrl;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * True for a URL on the buyer's own machine (a self-hosted install on
 * localhost or a `*.localhost` Portless name). Nobody else can receive a
 * redirect there, so it is safe to send the checkout session id to it.
 */
export function isLoopbackRedirectUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const { hostname, protocol } = new URL(url);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost'))
    );
  } catch {
    return false;
  }
}
