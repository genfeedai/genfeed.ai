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
