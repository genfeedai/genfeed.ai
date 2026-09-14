packages: contracts, props, ui

Both web error-boundary import paths use one catch/retry implementation. The
simple boundary keeps unlimited retries and its existing fallback; the display
adapter keeps three retries, diagnostic logging and the development debug modal.
The shared `ErrorBoundaryProps` contract adds a render fallback, reporting/reset
callbacks and an optional retry limit. `IErrorBoundaryState` now retains the caught
error object with the retry count instead of separate message/stack fields.
