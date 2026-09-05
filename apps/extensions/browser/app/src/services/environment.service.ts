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

/**
 * Public brand assets live under `cdn.genfeed.ai/assets/**` — the same bucket
 * the web apps read through `EnvironmentService.assetsEndpoint`. The old
 * `assets.genfeed.ai` host does not exist and 404s every request, so the
 * popup logo and the injected dropdown logo both rendered broken.
 */
export const assetsEndpoint =
  process.env.PLASMO_PUBLIC_ASSETS_ENDPOINT || 'https://cdn.genfeed.ai/assets';

/** Brand mark used by the popup header. */
export const logoURL = `${assetsEndpoint}/branding/logo.svg`;

/** Brand mark for dark surfaces — the injected platform dropdown button. */
export const logoWhiteURL = `${assetsEndpoint}/branding/logo-white.png`;

export const cdnEndpoint = isDevelopment
  ? 'https://api.genfeed.localhost'
  : 'https://cdn.genfeed.ai';

export const ingredientsEndpoint = `${cdnEndpoint}/ingredients`;

export const wsEndpoint =
  process.env.PLASMO_PUBLIC_WS_ENDPOINT || 'https://notifications.genfeed.ai';

export const websiteDomain =
  process.env.PLASMO_PUBLIC_WEBSITE_ENDPOINT ||
  (isDevelopment ? 'https://website.genfeed.localhost' : 'https://genfeed.ai');

/**
 * Studio app (apps/app) URL — serves the auth routes (`/login`, `/sign-up`).
 * The marketing site (`websiteDomain`) does NOT host these routes, so auth
 * links must target this domain instead.
 */
export const appDomain =
  process.env.PLASMO_PUBLIC_APP_ENDPOINT ||
  (isDevelopment ? 'https://app.genfeed.localhost' : 'https://app.genfeed.ai');

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Origins the extension may inspect for Genfeed auth cookies. The configured
 * canonical app origin is always tried first.
 */
export const authCookieOrigins = Array.from(new Set([getOrigin(appDomain)]));

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
