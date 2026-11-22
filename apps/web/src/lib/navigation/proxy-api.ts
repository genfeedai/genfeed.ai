import {
  getBetterAuthServerToken,
  isTransientBetterAuthTokenFailure,
} from '@genfeedai/auth-client/server';
import type { NextRequest } from 'next/server';

const TRAILING_SLASH_PATTERN = /\/$/;

type BootstrapBrandSummary = {
  id: string;
  organization?: {
    accountType?: string | null;
    slug?: string;
  };
  slug?: string;
};

export type BootstrapResponse = {
  access?: {
    brandId?: string;
    isOnboardingCompleted?: boolean;
  };
  brands?: BootstrapBrandSummary[];
  currentUser?: {
    isOnboardingCompleted?: boolean;
    onboardingStepsCompleted?: unknown;
  } | null;
};

export type OrganizationMineResponseItem = {
  isActive: boolean;
  slug?: string;
};

export function getApiBaseUrl(): string {
  const rawBaseUrl = (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    'http://localhost:3010/v1'
  ).replace(TRAILING_SLASH_PATTERN, '');

  try {
    const url = new URL(rawBaseUrl);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/v1';
      return url.toString().replace(TRAILING_SLASH_PATTERN, '');
    }
  } catch {
    // Relative paths such as /v1 are already valid API bases for fetch.
  }

  return rawBaseUrl;
}

/**
 * Either a bootstrap payload or the fact that the API did not give us one.
 * Kept distinct so a successful response with a null body still falls through
 * to the organizations lookup, as an unmemoised fetch did.
 */
export type BootstrapRead =
  | { bootstrap: BootstrapResponse | null; isAvailable: true }
  | { isAvailable: false };

const UNAVAILABLE_BOOTSTRAP: BootstrapRead = { isAvailable: false };

/**
 * Longest the proxy waits on one API read. Every protected navigation waits on
 * these, so a slow API must degrade to "unavailable" long before the platform
 * kills the request.
 */
const PROXY_API_TIMEOUT_MS = 3_000;

export async function fetchBootstrap(token: string): Promise<BootstrapRead> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/bootstrap`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(PROXY_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      return UNAVAILABLE_BOOTSTRAP;
    }

    return {
      bootstrap: (await response.json()) as BootstrapResponse | null,
      isAvailable: true,
    };
  } catch {
    return UNAVAILABLE_BOOTSTRAP;
  }
}

/**
 * The caller's organizations, or null when the API did not answer in time,
 * refused, or failed.
 */
export async function fetchMineOrganizations(
  token: string,
): Promise<OrganizationMineResponseItem[] | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/organizations?mine=true`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(PROXY_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as OrganizationMineResponseItem[] | null;
  } catch {
    return null;
  }
}

export interface BearerTokenResult {
  /**
   * The exchange failed on a network error, timeout or 5xx. The API did not
   * reject the session, so this is not a sign-out.
   */
  hasTransientFailure: boolean;
  token: string | null;
}

export async function getBetterAuthBearerToken(
  req: NextRequest,
): Promise<BearerTokenResult> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) {
    return { hasTransientFailure: false, token: null };
  }

  let hasTransientFailure = false;
  // Every navigation and RSC prefetch passes through here. The shared helper
  // reuses one token per session, since `/token` is rate limited per client.
  const token = await getBetterAuthServerToken(cookieHeader, {
    onFailure: (failure) => {
      if (failure.isFinal && isTransientBetterAuthTokenFailure(failure)) {
        hasTransientFailure = true;
      }
    },
    tokenUrl: `${getApiBaseUrl()}/auth/token`,
  });

  return { hasTransientFailure: token === null && hasTransientFailure, token };
}
