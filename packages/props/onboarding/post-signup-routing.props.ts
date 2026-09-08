export type PostSignupIntent =
  | { kind: 'plan-checkout'; stripePriceId: string }
  | { kind: 'credits-checkout'; credits: number }
  | { kind: 'auto-brand'; domain: string }
  | { kind: 'manual-brand' };

export interface ResolvePostSignupIntentInput {
  personalEmailDomains: readonly string[];
  primaryEmail?: string | null;
  selectedCredits?: string | null;
  selectedPlan?: string | null;
}

export type PostSignupRoutingState = {
  showFallback: boolean;
  resolveOnboardingHref: () => Promise<string>;
  retryBrandOsHandoff?: (() => void) | undefined;
};
