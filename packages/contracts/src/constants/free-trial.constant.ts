import type {
  FreeTrialEmailTemplateKey,
  IFreeTrialEmailDefinition,
} from '../interfaces/billing/free-trial.interface';

const HOUR_MS = 3_600_000;

/**
 * Hosted free trial: an organization that never paid keeps its free credits
 * (signup gift, trial credits, onboarding rewards) for this long after it was
 * created. Past it, the remaining free credits expire and every credit
 * admission is refused until the organization buys credits or subscribes.
 */
export const FREE_TRIAL_DURATION_HOURS = 72;
export const FREE_TRIAL_DURATION_MS = FREE_TRIAL_DURATION_HOURS * HOUR_MS;

/** The "ends in 24 hours" notice goes out this long before the trial ends. */
export const FREE_TRIAL_ENDING_NOTICE_MS = 24 * HOUR_MS;

/**
 * Trial notices only go out close to the moment they describe. An
 * organization whose window closed long ago (it predates the trial, or the
 * sweep was down) gets no late "ends in 24 hours" or "has ended" email.
 */
export const FREE_TRIAL_NOTICE_GRACE_MS = 24 * HOUR_MS;

/**
 * The trial clock starts when the organization is created. Signup creates the
 * organization in the same request that grants the signup gift, so this is
 * the moment the first free credits land. The column is immutable and set by
 * the database, so it needs no migration and cannot be reset by a client.
 */
export function resolveFreeTrialEndsAt(organizationCreatedAt: Date): Date {
  return new Date(organizationCreatedAt.getTime() + FREE_TRIAL_DURATION_MS);
}

export const FREE_TRIAL_EMAILS = {
  'trial-credits-low': {
    action: 'credits',
    actionLabel: 'Get more credits',
    paragraphs: [
      'Your free credits are almost gone. What is left will not cover another image.',
      'Buy a credit pack or pick a plan to keep creating.',
    ],
    subject: "You're running low on credits",
    templateKey: 'trial-credits-low',
  },
  'trial-ended': {
    action: 'plans',
    actionLabel: 'Choose a plan',
    paragraphs: [
      'Your 3-day free trial has ended, and any free credits you had left have expired.',
      'Your brands, drafts and content are still here. Buy credits or pick a plan to keep creating.',
    ],
    subject: 'Your free trial has ended',
    templateKey: 'trial-ended',
  },
  'trial-ending': {
    action: 'plans',
    actionLabel: 'Choose a plan',
    paragraphs: [
      'Your free trial ends in 24 hours. Free credits you have not used by then will expire.',
      'Buy credits or pick a plan to keep creating after the trial.',
    ],
    subject: 'Your free trial ends in 24 hours',
    templateKey: 'trial-ending',
  },
} as const satisfies Record<
  FreeTrialEmailTemplateKey,
  IFreeTrialEmailDefinition
>;

export function isFreeTrialEmailTemplateKey(
  value: string,
): value is FreeTrialEmailTemplateKey {
  return Object.hasOwn(FREE_TRIAL_EMAILS, value);
}
