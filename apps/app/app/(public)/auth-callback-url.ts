import {
  buildBrowserAuthCallbackURL,
  resolveAuthContinuation,
} from '@genfeedai/auth-client/callback';
import {
  extractBrandDomain,
  parseReferralCode,
  resolveSelectedPlanParam,
} from '@/lib/onboarding/onboarding-access.util';

const ROOT_CALLBACK_URL = '/';
const POST_SIGNUP_CALLBACK_URL = '/onboarding/post-signup';
const BRAND_OS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PUBLIC_YOUTUBE_CLIP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type AuthCallbackURLOptions = {
  defaultCallbackURL?: string;
  includeOnboardingHandoffParams?: boolean;
};

function getExplicitAuthCallbackURL(
  searchParams: Pick<URLSearchParams, 'get'>,
): string | null {
  const callbackURL =
    searchParams.get('callbackUrl') ||
    searchParams.get('return_to') ||
    searchParams.get('redirect_url') ||
    null;

  return resolveAuthContinuation(callbackURL);
}

function parsePositiveIntegerParam(value?: string | null): string | null {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number.parseInt(normalizedValue, 10);
  return parsed > 0 ? String(parsed) : null;
}

export function parseBrandOsPreviewToken(value?: string | null): string | null {
  const token = value?.trim();
  return token && BRAND_OS_TOKEN_PATTERN.test(token) ? token : null;
}

export function parsePublicYoutubeClipToken(
  value?: string | null,
): string | null {
  const token = value?.trim();
  return token && PUBLIC_YOUTUBE_CLIP_TOKEN_PATTERN.test(token) ? token : null;
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
  const brandOsToken = parseBrandOsPreviewToken(
    searchParams.get('brandOsToken'),
  );
  const clipToolToken = parsePublicYoutubeClipToken(
    searchParams.get('clipToolToken'),
  );
  const referralCode = parseReferralCode(searchParams.get('ref'));

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

  if (brandOsToken) {
    params.set('brandOsToken', brandOsToken);
  }

  if (clipToolToken) {
    params.set('clipToolToken', clipToolToken);
  }

  if (referralCode) {
    params.set('ref', referralCode);
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

  if (
    options.includeOnboardingHandoffParams ||
    parseBrandOsPreviewToken(searchParams.get('brandOsToken')) ||
    parsePublicYoutubeClipToken(searchParams.get('clipToolToken'))
  ) {
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

export function toAbsoluteAuthCallbackURL(callbackURL: string): string {
  const origin =
    typeof window === 'undefined'
      ? 'https://app.genfeed.ai'
      : window.location.origin;
  return buildBrowserAuthCallbackURL(callbackURL, origin);
}

/** Build the fixed public page URL used to complete a password reset. */
export function toAbsolutePasswordResetURL(resetPath: string): string {
  const origin =
    typeof window === 'undefined'
      ? 'https://app.genfeed.ai'
      : window.location.origin;
  const fallback = `${origin}/reset-password`;

  try {
    const resolved = new URL(resetPath, origin);
    return resolved.origin === origin && resolved.pathname === '/reset-password'
      ? resolved.toString()
      : fallback;
  } catch {
    return fallback;
  }
}
