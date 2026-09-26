packages: @genfeedai/props @genfeedai/services

Onboarding: auto-onboard from the work email domain (#5171).

- `@genfeedai/props`: removed `./onboarding/brand-account-type-selector.props`
  and `./onboarding/brand-form-fields.props` (the account-type / name /
  audience / tone onboarding forms are gone); added
  `./onboarding/brand-loading-state.props` and
  `./onboarding/brand-website-prompt.props` for the new domain-loading step.
- `@genfeedai/services`: `OnboardingService` gains `queueStarterAssets(brandId,
  websiteUrl?)`, which calls the new `POST /onboarding/starter-assets`
  endpoint to queue the background starter post + ad draft for a brand.
