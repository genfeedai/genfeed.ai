import {
  extractBrandDomain,
  resolveSelectedPlanParam,
} from '@/lib/onboarding/onboarding-access.util';

const ROOT_CALLBACK_URL = '/';
const POST_SIGNUP_CALLBACK_URL = '/onboarding/post-signup';

type AuthCallbackURLOptions = {
  defaultCallbackURL?: string;
  includeOnboardingHandoffParams?: boolean;
};

function getExplicitAuthCallbackURL(
  searchParams: Pick<URLSearchParams, 'get'>,
): string | null {
  return (
    searchParams.get('callbackUrl') ||
    searchParams.get('return_to') ||
    searchParams.get('redirect_url') ||
    null
  );
}

function parsePositiveIntegerParam(value?: string | null): string | null {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number.parseInt(normalizedValue, 10);
  return parsed > 0 ? String(parsed) : null;
}

function buildPostSignupCallbackURL(
  searchParams: Pick<URLSearchParams, 'get'>,
): string {
  const params = new URLSearchParams();
  const selectedPlan = resolveSelectedPlanParam(searchParams.get('plan'));
  const selectedCredits = parsePositiveIntegerParam(
    searchParams.get('credits'),
  );
  const brandDomain = extractBrandDomain(searchParams.get('brandDomain'));
  const brandName = searchParams.get('brandName')?.trim();

  if (selectedPlan) {
    params.set('plan', selectedPlan);
  }

  if (selectedCredits) {
    params.set('credits', selectedCredits);
  }

  if (brandDomain) {
    params.set('brandDomain', brandDomain);
  }

  if (brandName) {
    params.set('brandName', brandName);
  }

  const query = params.toString();
  return query
    ? `${POST_SIGNUP_CALLBACK_URL}?${query}`
    : POST_SIGNUP_CALLBACK_URL;
}

export function getAuthCallbackURL(
  searchParams: Pick<URLSearchParams, 'get'>,
  options: AuthCallbackURLOptions = {},
): string {
  const explicitCallbackURL = getExplicitAuthCallbackURL(searchParams);
  if (explicitCallbackURL) {
    return explicitCallbackURL;
  }

  if (options.includeOnboardingHandoffParams) {
    return buildPostSignupCallbackURL(searchParams);
  }

  return options.defaultCallbackURL ?? ROOT_CALLBACK_URL;
}

export function getAuthFlowHref(path: string, callbackURL: string): string {
  if (callbackURL === ROOT_CALLBACK_URL) {
    return path;
  }

  const params = new URLSearchParams({ callbackUrl: callbackURL });
  return `${path}?${params.toString()}`;
}

/**
 * Hosts an authenticated callback is allowed to land on, in addition to the
 * active window origin. Anything outside this set is treated as an open-redirect
 * attempt and rewritten to the origin root.
 */
const ALLOWED_CALLBACK_HOSTS = new Set([
  'app.genfeed.ai',
  'genfeed.ai',
  'www.genfeed.ai',
]);

/** Native-app deep-link schemes explicitly trusted as post-auth targets. */
const ALLOWED_DEEP_LINK_SCHEMES = ['genfeedai-desktop:'];

export function toAbsoluteAuthCallbackURL(callbackURL: string): string {
  const origin =
    typeof window === 'undefined'
      ? 'https://app.genfeed.ai'
      : window.location.origin;
  const fallback = `${origin}/`;

  const lower = callbackURL.toLowerCase();

  // Trusted desktop deep links (e.g. genfeedai-desktop://auth) pass through.
  if (ALLOWED_DEEP_LINK_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return callbackURL;
  }

  // Protocol-relative URLs (//evil.com) bypass origin checks — reject.
  if (callbackURL.startsWith('//')) {
    return fallback;
  }

  // Absolute URL carrying a scheme: only http(s) to the active origin or a
  // known Genfeed host is allowed. javascript:/data:/external hosts are
  // rewritten to the origin root to prevent post-auth open redirects.
  if (/^[a-z][a-z0-9+.-]*:/i.test(callbackURL)) {
    try {
      const parsed = new URL(callbackURL);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return fallback;
      }
      if (parsed.origin === origin) {
        return callbackURL;
      }
      if (
        parsed.protocol === 'https:' &&
        ALLOWED_CALLBACK_HOSTS.has(parsed.hostname)
      ) {
        return callbackURL;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  if (callbackURL.startsWith('/')) {
    return `${origin}${callbackURL}`;
  }

  return `${origin}/${callbackURL}`;
}
