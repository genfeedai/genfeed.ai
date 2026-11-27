/**
 * Genfeed Cloud has no free tier: an organization that never paid may run the
 * onboarding and read what it made, but it publishes and schedules nothing
 * until its first payment, a plan or a credit pack. Self-hosted deployments
 * have no organization billing and never see this refusal.
 *
 * One code names the refusal on every surface: the API error a caller gets
 * when it schedules or publishes, the error stored on a target the worker
 * refused, and the prompt the app opens.
 */

import { APP_ROUTES } from '../../constants/routes.constant';

const TRAILING_SLASHES = /\/+$/;

/** The refusal only happens on Genfeed Cloud, so its app is the default. */
const CLOUD_APP_URL = 'https://app.genfeed.ai';

/** The organization never paid, so it cannot publish or schedule. */
export const PUBLISHING_PAYMENT_REQUIRED_CODE = 'publishing_payment_required';

export function isPublishingPaymentRequiredCode(
  code: string | null | undefined,
): code is typeof PUBLISHING_PAYMENT_REQUIRED_CODE {
  return code === PUBLISHING_PAYMENT_REQUIRED_CODE;
}

/** The page where a plan or credits are bought. */
export function publishingPaymentUrl(appUrl: string = CLOUD_APP_URL): string {
  return `${appUrl.replace(TRAILING_SLASHES, '')}${APP_ROUTES.ONBOARDING.PLANS}`;
}

/**
 * The sentence a person or an agent reads when publishing is refused. It names
 * the reason, the way out and the link, so a script that only logs the message
 * still tells its owner what to do.
 */
export function publishingPaymentMessage(
  url: string = publishingPaymentUrl(),
): string {
  return `Publishing and scheduling start with your first payment. Pick a plan or buy credits, and your drafts stay saved: ${url}`;
}
