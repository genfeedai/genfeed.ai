export type PostSignupIntent =
  | { kind: 'plan-checkout'; stripePriceId: string }
  | { kind: 'credits-checkout'; credits: number };

export type PostSignupRoutingState = {
  showFallback: boolean;
  resolveOnboardingHref: () => Promise<string>;
  retryBrandOsHandoff?: (() => void) | undefined;
};
