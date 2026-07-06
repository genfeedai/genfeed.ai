export type LifecycleEmailSequence =
  | 'welcome'
  | 'activation-nudge'
  | 'abandoned-checkout'
  | 'win-back';

export type LifecycleEmailStep =
  | 'welcome-day-0'
  | 'welcome-day-2'
  | 'welcome-day-7'
  | 'activation-nudge'
  | 'checkout-recovery'
  | 'win-back';

export interface LifecycleEmailJobData {
  userId: string;
  sequence: LifecycleEmailSequence;
  step: LifecycleEmailStep;
  triggerKey: string;
  organizationId?: string;
  checkoutSessionId?: string;
  subscriptionId?: string;
}
