---
name: request abort is client disconnect
description: Generation cancel-on-abort listens to response.close only — request.close is the body finishing
type: feedback
---

# Cancel a provider job only when the client is gone

`createRequestAbortSignal` must listen to **`response.close`** while
`!writableEnded`. Do not listen to IncomingMessage `request.close`.

**Why:** Node emits `request.close` when the POST body has been read.
Local SaaS polls Replicate on that same request. Treating body-complete
as a hangup called `cancelPrediction` in ~700ms, so flux-schnell showed
Canceled on the Replicate dashboard.

**How to apply:** Keep the already-destroyed / already-aborted short
circuit. Abort only on `response.close` before the response is written.
Successful completion still emits `close` with `writableEnded === true`
and must not cancel.
