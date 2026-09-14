packages: @genfeedai/hooks

Add `navigation/use-onboarding-route-access/use-onboarding-route-access` with
`useOnboardingRouteAccess(pathname)`, which returns `canRender` and
`redirectTarget` using the existing onboarding and billing access policy.

Settings commands use this read-only decision before offering a destination.
The onboarding guard still owns redirects, and its desktop bypass is unchanged.
No consumer migration or configuration change is required.
