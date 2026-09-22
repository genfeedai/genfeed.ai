import type { ISignupAttribution } from '@genfeedai/contracts/interfaces';
import { extractBrandDomain } from './signup-brand-domain.helper';

/**
 * Query parameters that carry first-touch attribution from the marketing site
 * onto the app sign-up URL. `utm_term` is deliberately absent: it is free-text
 * search input.
 */
export const SIGNUP_ATTRIBUTION_QUERY_PARAMS = {
  landingPath: 'signup_landing',
  referrerDomain: 'signup_referrer',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',
  utmMedium: 'utm_medium',
  utmSource: 'utm_source',
} as const satisfies Record<keyof ISignupAttribution, string>;

export const SIGNUP_ATTRIBUTION_MAX_VALUE_LENGTH = 100;
export const SIGNUP_ATTRIBUTION_MAX_PATH_LENGTH = 200;

// No `/` or `:` in campaign values, and no `//` in paths, so a URL can never
// be smuggled into storage as a UTM tag or landing path.
const ATTRIBUTION_VALUE_PATTERN = /^[\p{L}\p{N} ._+~-]+$/u;
const LANDING_PATH_PATTERN = /^(?!.*\/\/)\/[\p{L}\p{N}._~/-]*$/u;
const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

type SignupAttributionKey = keyof ISignupAttribution;

const UTM_KEYS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
] as const satisfies readonly SignupAttributionKey[];

/** Lowercased, trimmed campaign value, or undefined when it is not usable. */
export function normalizeSignupAttributionValue(
  value?: string | null,
): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase();

  if (
    !normalized ||
    normalized.length > SIGNUP_ATTRIBUTION_MAX_VALUE_LENGTH ||
    !ATTRIBUTION_VALUE_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

/** Path only: the query string and fragment never survive. */
export function normalizeSignupLandingPath(
  value?: string | null,
): string | undefined {
  const path = value?.trim().split(/[?#]/)[0];

  if (
    !path ||
    path.length > SIGNUP_ATTRIBUTION_MAX_PATH_LENGTH ||
    !LANDING_PATH_PATTERN.test(path)
  ) {
    return undefined;
  }

  return path;
}

export function normalizeSignupReferrerDomain(
  value?: string | null,
): string | undefined {
  const domain = extractBrandDomain(value);

  if (
    !domain ||
    domain.length > SIGNUP_ATTRIBUTION_MAX_VALUE_LENGTH ||
    !DOMAIN_PATTERN.test(domain)
  ) {
    return undefined;
  }

  return domain;
}

/**
 * The referring domain when the visitor arrived from another site. A referrer
 * on the current host, a parent domain, or a sibling subdomain (the website
 * handing off to the app) is internal navigation and yields undefined.
 */
export function resolveExternalReferrerDomain(
  referrer: string | null | undefined,
  currentHostname: string,
): string | undefined {
  const domain = normalizeSignupReferrerDomain(referrer);
  const host = extractBrandDomain(currentHostname);

  if (!domain || !host) {
    return domain;
  }

  const siteRoot = host.split('.').slice(-2).join('.');
  const isInternal =
    domain === siteRoot || domain.endsWith(`.${siteRoot}`) || domain === host;

  return isInternal ? undefined : domain;
}

/** Read and normalize attribution carried on a URL's query string. */
export function readSignupAttributionParams(
  params: Pick<URLSearchParams, 'get'>,
): ISignupAttribution {
  const attribution: ISignupAttribution = {};

  for (const key of UTM_KEYS) {
    const value = normalizeSignupAttributionValue(
      params.get(SIGNUP_ATTRIBUTION_QUERY_PARAMS[key]),
    );
    if (value) {
      attribution[key] = value;
    }
  }

  const referrerDomain = normalizeSignupReferrerDomain(
    params.get(SIGNUP_ATTRIBUTION_QUERY_PARAMS.referrerDomain),
  );
  if (referrerDomain) {
    attribution.referrerDomain = referrerDomain;
  }

  const landingPath = normalizeSignupLandingPath(
    params.get(SIGNUP_ATTRIBUTION_QUERY_PARAMS.landingPath),
  );
  if (landingPath) {
    attribution.landingPath = landingPath;
  }

  return attribution;
}

export function hasSignupAttribution(attribution: ISignupAttribution): boolean {
  return Object.values(attribution).some(Boolean);
}

/** Attribution as its sign-up query parameters, in a stable order. */
export function toSignupAttributionParams(
  attribution: ISignupAttribution,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, param] of Object.entries(SIGNUP_ATTRIBUTION_QUERY_PARAMS)) {
    const value = attribution[key as SignupAttributionKey];
    if (value) {
      params.set(param, value);
    }
  }

  return params;
}

/**
 * Copy attribution onto a sign-up URL. Parameters the link already sets (a
 * campaign link's own UTM tags) are kept.
 */
export function appendSignupAttributionParams(
  url: URL,
  attribution: ISignupAttribution,
): void {
  for (const [param, value] of toSignupAttributionParams(attribution)) {
    if (!url.searchParams.has(param)) {
      url.searchParams.set(param, value);
    }
  }
}
