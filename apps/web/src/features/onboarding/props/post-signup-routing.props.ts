export type PostSignupIntent =
  | { kind: 'plan-checkout'; stripePriceId: string }
  | { kind: 'credits-checkout'; credits: number };

/** A claimed handle that was not applied because no brand could be picked. */
export interface SkippedHandleNotice {
  handle: string;
}

export type PostSignupRoutingState = {
  continueAfterSkippedHandle: () => void;
  showFallback: boolean;
  skippedHandle: SkippedHandleNotice | null;
  resolveOnboardingHref: () => Promise<string>;
  retryBrandOsHandoff?: (() => void) | undefined;
};
