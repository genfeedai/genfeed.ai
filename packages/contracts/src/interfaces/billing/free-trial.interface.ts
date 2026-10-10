/**
 * Where an organization stands in the hosted free trial.
 *
 * `trialEndsAt` is null when the trial does not apply: billing is off, the
 * deployment is self-hosted, the organization is operator-provisioned
 * (proactive or warm-up), shares a billing account with another organization,
 * or has paid (a Stripe-backed credit grant, a PAYG purchase, or a
 * subscription that Stripe created or that is active or trialing).
 */
export interface IFreeTrialState {
  isTrialExpired: boolean;
  trialEndsAt: Date | null;
}

export type FreeTrialEmailTemplateKey =
  | 'trial-ending'
  | 'trial-ended'
  | 'trial-credits-low';

export type FreeTrialEmailAction = 'credits' | 'plans';

/** Copy for one free-trial product email (see `FREE_TRIAL_EMAILS`). */
export interface IFreeTrialEmailDefinition {
  action: FreeTrialEmailAction;
  actionLabel: string;
  paragraphs: readonly string[];
  subject: string;
  templateKey: FreeTrialEmailTemplateKey;
}

/**
 * The balance below which an organization is "running low"
 * (`LowCreditThresholdService`). `threshold` is null when no alert applies:
 * an expired trial, or neither a default-image price nor a paid grant known.
 */
export interface ILowCreditStanding {
  isTrialSubject: boolean;
  threshold: number | null;
}
