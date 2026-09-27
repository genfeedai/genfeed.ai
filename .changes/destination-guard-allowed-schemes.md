packages: @genfeedai/libs

Add an optional `allowedSchemes` field to `DestinationGuardOptions` in
`@genfeedai/libs/security/destination-guard`. Defaults to `['http:', 'https:']`
— unchanged behavior for every existing `resolveSafeDestination`/`safeFetch`
caller. Passing `{ allowedSchemes: ['https:'] }` rejects a non-HTTPS
destination, including a redirect target reached mid-request, before any DNS
lookup or connection is attempted.

`ServerFunnelCaptureService` (genfeedai/genfeed.ai#5314) is the first
consumer, scoping its PostHog capture request to HTTPS-only. No action is
required for existing callers.
