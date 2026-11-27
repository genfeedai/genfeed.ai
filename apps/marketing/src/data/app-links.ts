import { creatorSupportAppPath } from '@genfeedai/contracts/constants';
import { APP_ROUTES } from '@genfeedai/contracts/constants/routes.constant';
import { EnvironmentService } from '@services/core/environment.service';

/**
 * Absolute URL of a route on the Genfeed app origin. The website links to the
 * app from dozens of CTAs; building every one from `APP_ROUTES` keeps them on
 * the routes the app really serves instead of hand-typed paths.
 */
export function getAppUrl(route: string, search = ''): string {
  return `${EnvironmentService.apps.app}${route}${search}`;
}

/**
 * The one label every sign-up button on the site reads. Genfeed Cloud has no
 * free tier: a new account tries Genfeed on its own brand during onboarding,
 * and publishing starts with the first payment (a plan or a credit pack).
 */
export const SIGN_UP_LABEL = 'Start creating';

/** The same offer as a sentence, where a call to action needs one. */
export const SIGN_UP_OFFER = 'Try it on your brand, pay when you publish.';

export function getAppSignUpUrl(search = ''): string {
  return getAppUrl(APP_ROUTES.SIGN_UP, search);
}

export function getAppLoginUrl(search = ''): string {
  return getAppUrl(APP_ROUTES.LOGIN, search);
}

/**
 * The app page where a signed-in reader supports a creator beyond a tip:
 * subscribe, or unlock an article. The app asks them to sign in first.
 */
export function getSupportCreatorHref(
  handle: string,
  articleId?: string,
): string {
  return getAppUrl(creatorSupportAppPath(handle, articleId));
}

/**
 * Where a signed-out reader's Subscribe goes: Genfeed sign-up, carrying the
 * creator's handle so the app subscribes the new account once it exists.
 */
export function getFollowSignUpHref(handle: string): string {
  return getAppSignUpUrl(`?${new URLSearchParams({ follow: handle })}`);
}
