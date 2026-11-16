/**
 * Security headers for the web app.
 *
 * The Content-Security-Policy ships in report-only mode first: the app loads
 * user media and embeds from many hosts, so an enforced policy written from a
 * code inventory alone would break pages. Violations go to `/api/csp-report`;
 * the policy is tightened from those reports before it is enforced.
 *
 * The policy is static (no nonce). A per-request nonce forces every page to
 * render dynamically, which would defeat `cacheComponents` and partial
 * prefetching, so inline bootstrap scripts (runtime config, theme, Next's own
 * payload) are allowed with `'unsafe-inline'` until they can be hashed.
 */

const HTTP_SCHEME_PATTERN = /^http/;

export const CSP_REPORT_PATH = '/api/csp-report';

export interface SecurityHeader {
  key: string;
  value: string;
}

export interface ContentSecurityPolicyOptions {
  /** Origins the browser may fetch from beyond Genfeed's own hosts. */
  connectOrigins?: readonly (string | undefined)[];
}

const POSTHOG_ORIGINS = [
  'https://eu.i.posthog.com',
  'https://eu-assets.i.posthog.com',
];

const SENTRY_ORIGINS = ['https://*.ingest.sentry.io', 'https://*.sentry.io'];

const GENFEED_ORIGINS = ['https://*.genfeed.ai'];

const EMBED_ORIGINS = [
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
  'https://www.tiktok.com',
  'https://www.instagram.com',
];

function toOrigin(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin: string): string {
  return origin.replace(HTTP_SCHEME_PATTERN, 'ws');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function buildContentSecurityPolicy(
  options: ContentSecurityPolicyOptions = {},
): string {
  const configuredOrigins = (options.connectOrigins ?? []).flatMap((value) => {
    const origin = toOrigin(value);
    return origin ? [origin, toWebSocketOrigin(origin)] : [];
  });

  const connectSources = unique([
    "'self'",
    ...GENFEED_ORIGINS,
    'wss://*.genfeed.ai',
    ...configuredOrigins,
    ...POSTHOG_ORIGINS,
    ...SENTRY_ORIGINS,
    // Direct-to-storage uploads use presigned bucket URLs.
    'https://*.amazonaws.com',
    'https://*.cloudfront.net',
  ]);

  const directives: Array<[string, readonly string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'", ...POSTHOG_ORIGINS, 'blob:']],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    // Generated and imported media come from provider CDNs the app does not
    // control, so images and media stay open to https until reports show the
    // real set.
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['media-src', ["'self'", 'blob:', 'data:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', connectSources],
    ['frame-src', EMBED_ORIGINS],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
    ['report-uri', [CSP_REPORT_PATH]],
  ];

  return directives
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Headers that are safe to enforce today: they do not depend on which hosts
 * the app talks to. Camera and microphone stay available to the app itself
 * (voice and video recording); everything else powerful is off.
 */
export function buildEnforcedSecurityHeaders(): SecurityHeader[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(self), microphone=(self), geolocation=(), usb=(), serial=(), bluetooth=(), hid=()',
    },
  ];
}

export function buildSecurityHeaders(
  options: ContentSecurityPolicyOptions & { isProduction: boolean },
): SecurityHeader[] {
  const headers = buildEnforcedSecurityHeaders();

  // Next's dev runtime needs eval and inline HMR scripts; reporting them would
  // only add noise.
  if (options.isProduction) {
    headers.push({
      key: 'Content-Security-Policy-Report-Only',
      value: buildContentSecurityPolicy(options),
    });
  }

  return headers;
}
