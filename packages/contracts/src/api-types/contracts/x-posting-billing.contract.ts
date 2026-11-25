/**
 * What posting to X costs an organization, and the refusal when its wallet
 * cannot pay. X bills Genfeed for every request, so each published post is
 * charged in credits (a post with a link costs more). X has no paywall: any
 * account with credits can post, inside the same daily caps as every other
 * platform. Only an empty wallet refuses.
 *
 * One code names the refusal on every surface: the API error a caller gets when
 * it publishes, the error stored on a failed target, the failure alert, and the
 * call to action beside a failed target in the app.
 */

import { APP_ROUTES } from '../../constants/routes.constant';

const TRAILING_SLASHES = /\/+$/;

/** The wallet cannot cover the credits the post costs. */
export const X_POSTING_INSUFFICIENT_CREDITS_CODE =
  'x_posting_insufficient_credits';

export function isXPostingBillingErrorCode(
  code: string | null | undefined,
): code is typeof X_POSTING_INSUFFICIENT_CREDITS_CODE {
  return code === X_POSTING_INSUFFICIENT_CREDITS_CODE;
}

/** The page where credits are bought. */
export function xPostingBillingUrl(appUrl: string): string {
  return `${appUrl.replace(TRAILING_SLASHES, '')}${APP_ROUTES.SETTINGS.CREDITS}`;
}

/**
 * The sentence a person or an agent reads when X posting is refused. It names
 * the reason, the way out and the link, so a script that only logs the message
 * still tells its owner what to do.
 */
export function xPostingBillingMessage(options: {
  hasLink?: boolean;
  url: string;
}): string {
  return options.hasLink
    ? `Not enough credits to post to X. Posts with a link cost more than posts without one. Buy credits to publish: ${options.url}`
    : `Not enough credits to post to X. Buy credits to publish: ${options.url}`;
}
