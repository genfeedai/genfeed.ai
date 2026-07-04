/**
 * URL/path normalization for PostHog product analytics (issue #1178).
 *
 * PostHog auto-attaches URL-bearing properties ($current_url, $referrer,
 * $pathname, $initial_current_url, $session_entry_url, $prev_pageview_pathname,
 * …) to every event. In the studio app, page URLs carry free-text query params
 * (?title=, ?description=) and paths carry tenant slugs plus opaque ids. To
 * honour the hard privacy contract (no free-text, no unbounded tenant identity
 * — FR8), every URL-bearing value is reduced to a bounded route template before
 * it can leave the client: the query string and hash are dropped, org/brand
 * slugs are templatized to :org/:brand, and high-cardinality id segments
 * collapse to :id.
 */

/**
 * Static top-level URL segments that are NOT a tenant org slug. Route groups
 * ((protected)/(public)/(onboarding)) are stripped from the URL, so these are
 * the real first segments of non-tenant routes. Anything else in position 0 is
 * treated as an org slug and templatized — the fail-closed direction, so a new
 * route can never leak a real slug (at worst a new public route loses its name
 * in analytics until it is added here).
 */
const NON_TENANT_TOP_LEVEL = new Set<string>([
  'admin',
  'api',
  'login',
  'logout',
  'managed-credits',
  'oauth',
  'onboarding',
  'playwright-ready',
  'request-access',
  'settings',
  'sign-up',
]);

/** Org-level (brand-less) route marker, e.g. /{orgSlug}/~/agent. */
const ORG_LEVEL_MARKER = '~';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
const HAS_DIGIT_RE = /\d/;

/**
 * True for high-cardinality opaque id segments (uuid, numeric id, or a long
 * mixed-alphanumeric cuid/nanoid). A long all-alpha slug (e.g. a brand name)
 * carries no digit and is therefore preserved, not collapsed.
 */
function isIdSegment(segment: string): boolean {
  if (UUID_RE.test(segment) || NUMERIC_RE.test(segment)) {
    return true;
  }
  return segment.length >= 20 && HAS_DIGIT_RE.test(segment);
}

/**
 * Reduce a pathname to a bounded route template: templatize the tenant
 * org/brand slugs and collapse opaque id segments. Any query/hash that slips in
 * is stripped defensively. Never throws.
 */
export function normalizeAnalyticsPathname(pathname: string): string {
  const pathOnly = pathname.split('?')[0].split('#')[0];
  const segments = pathOnly.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return '/';
  }

  if (!NON_TENANT_TOP_LEVEL.has(segments[0])) {
    segments[0] = ':org';
    if (segments.length > 1 && segments[1] !== ORG_LEVEL_MARKER) {
      segments[1] = ':brand';
    }
  }

  const normalized = segments.map((segment) => {
    if (
      segment === ':org' ||
      segment === ':brand' ||
      segment === ORG_LEVEL_MARKER
    ) {
      return segment;
    }
    return isIdSegment(segment) ? ':id' : segment;
  });

  return `/${normalized.join('/')}`;
}

/**
 * Reduce a URL (absolute or path-relative) to a bounded, query-free route
 * template. Absolute URLs keep their origin; the search and hash are always
 * dropped, and the path is normalized. Malformed input is degraded safely —
 * this never throws.
 */
export function sanitizeAnalyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${normalizeAnalyticsPathname(url.pathname)}`;
  } catch {
    const pathOnly = value.split('?')[0].split('#')[0];
    return pathOnly.startsWith('/')
      ? normalizeAnalyticsPathname(pathOnly)
      : pathOnly;
  }
}
