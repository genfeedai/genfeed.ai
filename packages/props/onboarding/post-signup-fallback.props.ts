export interface PostSignupFallbackProps {
  resolveOnboardingHref: () => Promise<string>;
  retryBrandOsHandoff?: (() => void) | undefined;
}
