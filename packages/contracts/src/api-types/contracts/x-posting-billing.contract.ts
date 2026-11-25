/**
 * What posting to X costs an organization, and the refusals that follow when it
 * cannot pay. X bills Genfeed for every request, so X posting is a paid-plan
 * feature and each published post is charged in credits.
 *
 * One code names each refusal on every surface: the API error a caller gets when
 * it publishes or schedules, the error stored on a failed target, the failure
 * alert, and the call to action beside a failed target in the app.
 */

import { APP_ROUTES } from '../../constants/routes.constant';

const TRAILING_SLASHES = /\/+$/;

/** The organization is on the free plan, so it cannot post to X. */
export const X_POSTING_REQUIRES_PAID_PLAN_CODE = 'x_posting_requires_paid_plan';

/** The organization is on a paid plan but cannot pay the credits the post costs. */
export const X_POSTING_INSUFFICIENT_CREDITS_CODE =
  'x_posting_insufficient_credits';

export type XPostingBillingErrorCode =
  | typeof X_POSTING_REQUIRES_PAID_PLAN_CODE
  | typeof X_POSTING_INSUFFICIENT_CREDITS_CODE;

export const X_POSTING_BILLING_ERROR_CODES: readonly XPostingBillingErrorCode[] =
  [X_POSTING_REQUIRES_PAID_PLAN_CODE, X_POSTING_INSUFFICIENT_CREDITS_CODE];

export function isXPostingBillingErrorCode(
  code: string | null | undefined,
): code is XPostingBillingErrorCode {
  return (
    typeof code === 'string' &&
    (X_POSTING_BILLING_ERROR_CODES as readonly string[]).includes(code)
  );
}

/** The app page that fixes the refusal: the plans page, or the credits page. */
export function xPostingBillingRoute(code: XPostingBillingErrorCode): string {
  return code === X_POSTING_REQUIRES_PAID_PLAN_CODE
    ? APP_ROUTES.SETTINGS.SUBSCRIPTION
    : APP_ROUTES.SETTINGS.CREDITS;
}

/** The absolute link to the page that fixes the refusal. */
export function xPostingBillingUrl(
  code: XPostingBillingErrorCode,
  appUrl: string,
): string {
  return `${appUrl.replace(TRAILING_SLASHES, '')}${xPostingBillingRoute(code)}`;
}

/**
 * The sentence a person or an agent reads when X posting is refused. It names
 * the reason, the way out and the link, so a script that only logs the message
 * still tells its owner what to do.
 */
export function xPostingBillingMessage(
  code: XPostingBillingErrorCode,
  options: { hasLink?: boolean; url: string },
): string {
  if (code === X_POSTING_REQUIRES_PAID_PLAN_CODE) {
    return `Posting to X needs a paid plan. Choose a plan to publish to X: ${options.url}`;
  }
  return options.hasLink
    ? `Not enough credits to post to X. Posts with a link cost more than posts without one. Buy credits to publish: ${options.url}`
    : `Not enough credits to post to X. Buy credits to publish: ${options.url}`;
}
