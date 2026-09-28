packages: @genfeedai/hooks

Add `useDeferredIsSignedIn`, which resolves the marketing header's signed-in
state on idle from a lazily imported session check (and again whenever the
page is shown), so the Better Auth client stays out of every website page's
first-load bundle.
