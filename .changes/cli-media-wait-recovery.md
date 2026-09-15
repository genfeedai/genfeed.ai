packages: cli

CLI image/video waits now read durable media state immediately and poll again two
seconds after each observation settles. Socket events request fresh reads, with
success or failure determined by the API response. One total timeout
covers status reads and socket setup, including missed events and disconnections.

Callers of `waitForCompletion` and `waitForGenerated` must supply
`getResult(signal)` that returns the original media record with its `id`, `status`,
and optional `error`. Forward the signal to `getImage(id, signal)` or
`getVideo(id, signal)` so timeout and cleanup can abort an in-flight read. Both
media GET helpers now accept this optional second argument; existing calls with
only an ID remain valid. `createWebSocketConnection` also accepts an optional
`AbortSignal` and checks it before and after resolving connection configuration.

The CLI-local `media-status` module exports `MediaObservation` and shared status
sets. `GENERATED`, `UPLOADED`, and `VALIDATED` resolve; `DRAFT` and `PROCESSING`
continue waiting. Other statuses reject. Authentication errors and non-retryable
4xx reads fail promptly; transient reads retry within the original deadline.

The `gf generate image` and `gf generate video` commands already forward the
signal and read the original asset. No command-line option or configuration
migration is required.
