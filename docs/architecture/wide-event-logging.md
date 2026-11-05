# Wide-event logging

Every backend request and queue job emits **one** structured event when it finishes. The event
carries everything the unit of work learned, so a question like "which checkout failures hit
enterprise orgs on the new model this hour?" is a query, not a grep. The approach is
[Boris Tane's "Logging sucks"](https://loggingsucks.com): log what happened to the request, not
what the code is doing.

## What emits an event

| Surface | Where it is installed | Event |
| --- | --- | --- |
| API (`apps/server/api`) | `createWideEventMiddleware` in `main.ts`, before CORS, rate limiting and auth | `kind: "http"` |
| files, notifications, mcp, discord, slack, telegram | `setupServiceShell({ wideEventSink })` (`runService` passes it) | `kind: "http"` |
| workers and files queue processors (every cron runs as a scheduled job) | `installWideEventJobInstrumentation` hooks `@nestjs/bullmq`'s `ProcessorDecoratorService` | `kind: "job"` |

Health probes (`/health`, `/v1/health/*`) never emit.

## Fields

Always present: `timestamp`, `kind`, `request_id`, `trace_id`, `span_id`, `service`, `duration_ms`,
`outcome` (`success` | `client_error` | `error`) and `sample_rate`. Present when known: `version`,
`environment`, `deployment_id`, `region`, `parent_span_id`.

- HTTP: `method`, `path` (no query string), `route` (the matched pattern, for example
  `/v1/posts/:id`), `status_code`, `user_agent`, `client_aborted`.
- Job: `job.queue`, `job.name`, `job.id`, `job.attempt`, `job.max_attempts`. The job payload is never logged.
- Business context, read after the guards ran: `user.id`, `user.subscription_tier`,
  `user.is_super_admin`, `organization.id`, `brand.id`, `auth_method`, `api_key.id`, `action_origin`.
  Jobs take `user.id`, `organization.id` and `brand.id` from the payload when it carries them.
- Performance: `database.query_count`, `database.query_duration_ms`, `database.slow_queries`
  (when `API_QUERY_METRICS` is on), `memory` on slow requests, `performance_severity`.
- Failures: `error.type`, `error.message`, `error.code`, `error.status`, `error.stack` (bounded).

Output goes through `redactSensitiveValue`, so keys such as `token`, `apiKey` and `authorization`
are replaced. Do not name a bucket `session` or `token`.

## Adding context

```ts
import { enrichWideEvent } from '@libs/logger/wide-event/wide-event.context';

enrichWideEvent({ generation: { model: 'veo-3.1', provider: 'fal', credits: 40 } });
```

Buckets merge one level deep, `undefined` never overwrites, and the call is a no-op outside a
request or job. Use snake_case, keep one bucket per concept, and put ids and enums in the event
rather than free text. Do not log a line to say what you just did: enrich instead.

## Tail sampling

The decision is made after the work finished (`wide-event.sampling.ts`):

- Always kept: `outcome: "error"`, caller errors other than 404 and 429 (401, 403 and 400 stay
  visible), requests over 2 s, jobs over 120 s, enterprise organizations and super admins.
- Everything else is kept at 5%.

Kept events carry `sample_rate` (`1`, or `0.05`). Weight counts by `1 / sample_rate` when you
aggregate, otherwise success volume is under-counted twentyfold.

## Output

In `NODE_ENV=production` wide events print as one JSON object per line. Locally they use the
readable Nest console format. Non-wide log lines are unchanged.

## Trace identity

`resolveTraceContext` (`wide-event.trace.ts`) is the only place trace identity is decided. It continues
an incoming W3C `traceparent` (new span id, `parent_span_id` set to the caller's span) or starts a
new trace, and honours a well-formed `x-request-id`. The response always echoes `x-request-id`.
When OpenTelemetry tracing lands, resolve `trace_id` and `span_id` from the active span in that one
function so spans and wide events share ids.
