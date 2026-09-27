packages: @genfeedai/props @genfeedai/ui

`ErrorFallbackProps` accepts an optional `data-testid` passthrough, and
`ErrorBoundary` wraps whatever it renders for a caught error in
`data-testid="error-boundary-fallback"`. Route smoke checks key off that
marker to fail on handled application errors (#5070).
