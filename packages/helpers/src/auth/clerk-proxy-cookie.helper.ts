type RequestCookie = {
  name: string;
  value: string;
};

type RequestCookiesLike = {
  getAll: () => RequestCookie[];
  has: (name: string) => boolean;
};

const CLERK_CLIENT_UAT_PREFIX = '__client_uat_';
const CLERK_DEV_BROWSER_TOKEN_SUFFIXED_PREFIX = '__clerk_db_jwt_';

/**
 * Detects stale Clerk client cookies that force suffixed-cookie mode
 * when the matching suffixed dev browser token is missing.
 */
export function getStaleClerkClientCookieNames(
  cookies: RequestCookiesLike,
): string[] {
  const staleCookieNames = new Set<string>();

  for (const cookie of cookies.getAll()) {
    if (!cookie.name.startsWith(CLERK_CLIENT_UAT_PREFIX)) {
      continue;
    }

    const suffix = cookie.name.slice(CLERK_CLIENT_UAT_PREFIX.length);
    if (!suffix) {
      continue;
    }

    const suffixedDevBrowserTokenName = `${CLERK_DEV_BROWSER_TOKEN_SUFFIXED_PREFIX}${suffix}`;

    if (!cookies.has(suffixedDevBrowserTokenName)) {
      staleCookieNames.add(cookie.name);
    }
  }

  return [...staleCookieNames];
}
