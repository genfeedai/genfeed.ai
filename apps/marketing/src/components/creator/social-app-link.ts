const LEADING_AT_PATTERN = /^@/;

/**
 * Where a social account opens on a phone. A native-app address is only given
 * for the networks with a profile scheme that takes a username; every other
 * account keeps its https link, which the phone already routes to the app when
 * it is installed.
 */
const APP_URL_BUILDERS: Readonly<
  Partial<Record<string, (handle: string) => string>>
> = {
  instagram: (handle) =>
    `instagram://user?username=${encodeURIComponent(handle)}`,
  twitter: (handle) =>
    `twitter://user?screen_name=${encodeURIComponent(handle)}`,
};

/** The app address for an account, or null when the network has no scheme. */
export function getSocialAppUrl(
  platform: string,
  handle: string,
): string | null {
  const build = APP_URL_BUILDERS[platform.toLowerCase()];
  return build && handle ? build(handle.replace(LEADING_AT_PATTERN, '')) : null;
}

const MOBILE_USER_AGENT = /android|iphone|ipad|ipod/i;

export function isMobileDevice(
  userAgent: string = navigator.userAgent,
): boolean {
  return MOBILE_USER_AGENT.test(userAgent);
}

const APP_OPEN_TIMEOUT_MS = 1500;

/**
 * Tries the app, then the web page. A phone that has the app switches to it and
 * hides this page; one that does not (or an in-app browser that blocks the
 * scheme) leaves the page visible, so the https link opens after a moment.
 */
export function openSocialApp(appUrl: string, webUrl: string): void {
  window.setTimeout(() => {
    if (!document.hidden) {
      window.location.assign(webUrl);
    }
  }, APP_OPEN_TIMEOUT_MS);
  window.location.assign(appUrl);
}
