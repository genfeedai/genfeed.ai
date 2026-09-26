packages: props, hooks

`useWorkflowExecutions` and `RunStatsStripProps` both gain an optional
`isStatsDegraded` flag. `useWorkflowExecutions` sets it when the last
statistics request failed or returned a non-summary payload and `stats` is a
fallback (previous cache with a recomputed `active`) rather than a fresh
response. `RunStatsStrip` uses the flag to note that its numbers may be
stale instead of rendering real-looking zeros silently.
