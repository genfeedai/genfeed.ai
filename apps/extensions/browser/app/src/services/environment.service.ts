export const JWT_LABEL = 'genfeed-jwt';

export const isDevelopment =
  process.env.NODE_ENV === 'development' ||
  process.env.PLASMO_PUBLIC_ENV === 'development';

export const isProduction =
  process.env.NODE_ENV === 'production' &&
  process.env.PLASMO_PUBLIC_ENV !== 'development';

export const isTest = String(process.env.NODE_ENV) === 'test';

export const apiEndpoint =
  process.env.PLASMO_PUBLIC_API_ENDPOINT || 'https://api.genfeed.ai/v1';

export const assetsEndpoint =
  process.env.PLASMO_PUBLIC_ASSETS_ENDPOINT || 'https://assets.genfeed.ai';

export const ingredientsEndpoint =
  process.env.PLASMO_PUBLIC_INGREDIENTS_ENDPOINT ||
  'https://ingredients.genfeed.ai';

export const wsEndpoint =
  process.env.PLASMO_PUBLIC_WS_ENDPOINT || 'https://notifications.genfeed.ai';

export const websiteDomain =
  process.env.PLASMO_PUBLIC_WEBSITE_ENDPOINT ||
  (isDevelopment ? 'http://genfeed.localhost:3002' : 'https://genfeed.ai');

/**
 * Studio app (apps/app) URL — serves the auth routes (`/login`, `/sign-up`).
 * The marketing site (`websiteDomain`) does NOT host these routes, so auth
 * links must target this domain instead.
 */
export const appDomain =
  process.env.PLASMO_PUBLIC_APP_ENDPOINT ||
  (isDevelopment ? 'http://genfeed.localhost:3000' : 'https://app.genfeed.ai');

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Origins the extension may inspect for Genfeed auth cookies. The legacy host
 * is a temporary compatibility security entry; the configured/canonical app
 * origin is always tried first.
 */
export const authCookieOrigins = Array.from(
  new Set([
    getOrigin(appDomain),
    ...(isDevelopment ? ['http://local.genfeed.ai:3000'] : []),
  ]),
);

export function isGenfeedAuthUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return authCookieOrigins.some((origin) => {
    try {
      return new URL(origin).hostname === hostname;
    } catch {
      return false;
    }
  });
}

export const cookieDomain = (() => {
  try {
    return new URL(appDomain).hostname;
  } catch {
    return isDevelopment ? 'genfeed.localhost' : 'genfeed.ai';
  }
})();

/** @deprecated Use individual exports instead */
export const EnvironmentService = {
  apiEndpoint,
  appDomain,
  authCookieOrigins,
  assetsEndpoint,
  cookieDomain,
  ingredientsEndpoint,
  isDevelopment,
  isProduction,
  isTest,
  JWT_LABEL,
  websiteDomain,
  wsEndpoint,
};
