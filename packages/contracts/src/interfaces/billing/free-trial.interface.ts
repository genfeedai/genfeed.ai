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
