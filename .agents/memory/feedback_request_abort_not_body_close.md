---
name: request abort is client disconnect
description: Generation cancel-on-abort listens to response.close only — a consumed request body is not a hangup
type: feedback
---

# Cancel a provider job only when the client is gone

`createRequestAbortSignal` must listen to **`response.close`** while
`!writableEnded`. Do not listen to IncomingMessage `request.close`.
Do not start aborted just because `request.destroyed` is true.

**Why:** After Express reads the JSON body, Node auto-destroys the
request stream and emits `request.close`. Local SaaS then polls
Replicate on that same request. Treating body-complete as a hangup
called `cancelPrediction` in ~700ms (`Cancelled by user` wrapped as
a 500 "Connection interrupted").

**How to apply:** Immediate abort only when `request.aborted` and the
response is still open. Abort later only on `response.close` before
the response is written. Successful completion still emits `close`
with `writableEnded === true` and must not cancel.
