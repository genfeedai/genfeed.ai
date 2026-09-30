# Queue stall evidence

## Redis and BullMQ

An alarm returning to OK means the next evaluated window contained no stall
events. It does not prove stalled jobs completed, that no work was lost, or that
side effects ran once. `StalledJobs5m` counts events, not distinct jobs. Do not
describe a recovered alarm as an active outage.

The prior operations document was removed with private operator material in
#5052. This replacement contains only the portable queue investigation procedure
and sanitized evidence for #5684; deployment credentials, resource identifiers,
payloads and private operator configuration belong outside this public tree.

### Recurrence evidence (#5684)

Read-only CloudWatch/ECS/Redis inspection on 2026-09-30 established:

| Incident (UTC) | Alarm evidence | Affected queue | Recovery and cause evidence |
| --- | --- | --- | --- |
| September 11 | Four events in the evaluated 10:51 window; ALARM 10:56:55.676, OK 11:01:55.677 after zero events in the 10:56 window | `workflow-execution`; retained per-queue metric sums to four | Worker/files log retention was seven days, so detailed logs had expired. Retained ECS events did not cover the workers incident window. Processing-worker identity, lease timing, job attempts, terminal outcomes and side-effect evidence are unavailable. |
| September 30 | Two events in the evaluated 01:46 window; ALARM 01:51:59.177, OK 01:56:59.178 after zero events in the 01:51 window | `onboarding-starter-assets`; per-queue sample at 01:50 sums to two | Worker logs show renewal failures at 01:47:09.126 and 01:48:16.037, followed by missing-lock errors for `moveToDelayed` at 01:47:15.734 and 01:48:20.442. The collector logged both stalls at 01:50:00.849. This establishes lease loss, not its underlying cause or terminal job outcome. |

CloudWatch retains metric aggregates longer than raw five-minute samples. The
September 11 per-queue sample is timestamped 10:55 after aggregation; that timestamp
is not the exact stall time. Alarm evaluation windows also differ from the
collector's rolling five-minute Redis event window.

For September 30, retained ECS service events show no workers/files replacement
during 01:30–02:15; the preceding replacement completed on September 28 around
22:28 UTC. Current task definitions expose a 120-second stop timeout for both
services. This verifies current configuration, not the historical image's runtime
lock options. September 11 deployment correlation remains unavailable.

Workers CPU maximum reached approximately 100% in both sampled incident windows;
files CPU reached approximately 100% on September 11 and below 7% on September 30.
The two inspected Redis clusters had zero evictions and engine CPU maxima below
10% in the September 30 window. A focused worker-log search at 01:45–01:51 found
no Redis network-error messages. These observations do not establish or exclude
event-loop starvation, a brief connection interruption, or renewal scheduling
delay. Neither historical event-loop delay nor per-worker lock settings were
recorded. No production jobs were created or retried for this investigation.

The existing logs and aggregates do **not** establish completed recovery, terminal
loss, distinct affected-job count, or duplicate external side effects for either
window. In particular, missing-lock errors after a processor exception do not prove
the exception caused the earlier lock loss. Preserve these outcomes as unknown
until queue-state and durable application/provider evidence can be correlated.

### Comparison with prior hardening

- #3119 added queue/job stall logs, per-queue metrics and the long-job preset:
  120-second lease, 30-second renewal/check intervals, default `maxStalledCount=1`.
- #3215 replaced immediate files SIGTERM exit with HTTP/Nest/BullMQ drain.
- #3248 applied the preset to files video/youtube workers and exposed a 120-second
  ECS stop timeout for workers/files. Those changes address replacement-time drain
  and bounded renewal gaps; they cannot guarantee that all stalls disappear.
- Current workflow workers use the long-job preset. The onboarding starter-assets
  processor uses BullMQ defaults. Neither historical worker's effective options
  were available in the retained incident evidence. A longer lease alone would
  delay stall detection and does not establish a fix for the observed recurrence.

This change adds diagnostics rather than changing leases, retries, concurrency or
job side effects. Keep #3065 closed. Investigate a behavioral mitigation only after
new evidence identifies the failure mode.

### Capture the next incident

1. Record alarm state, old/new state reasons and UTC evaluated windows, including
   the eventual recovery. Export a sanitized incident summary while logs still
   exist; alarm history alone is insufficient.
2. Query `StalledJobs5m` with both `Service=workers` and `Queue=<name>`. Historical
   series can remain queryable even when `list-metrics` omits inactive series.
   The aggregate `Service=workers` identifies the collector service, including
   files-owned queues; it is not proof that the processing worker ran there.
3. Search worker logs for `BullMQ worker evidence`. Each physical log line contains
   JSON with UTC `capturedAt`, queue, event, job ID when available, actual effective
   lock/renew/check settings, attempt counters and worker identity. No job payload,
   return value, token, Redis connection or raw exception is emitted.
4. Join `active`, `lock-renewal-failed`, `stalled`, subsequent `active`, `completed`
   and `failed` by queue/job ID. `processingWorkerId` on `active` identifies the
   processor; `observerWorkerId` on `stalled` identifies only the stall detector.
   They may differ across replicas. Repeated `active` events indicate redelivery,
   not necessarily duplicated side effects. `failed` can precede a configured retry;
   `failureKind=stall-limit` identifies exhausted stall recovery. A failed event can
   lack job ID when BullMQ already removed the failed job.
5. Match `started`, `closing`, `closed` and final job events with deployment/task
   stop timestamps and the incident image/task definition. A missing `closed` line
   does not by itself prove SIGKILL. The startup listener is attached after Nest
   registers workers; a job started during bootstrap can lack its initial `active`
   record. Files-runtime workers are not instrumented by this workers module.
6. Compare CPU/Redis metrics and `eventLoopDelayMaxMs`, measured since
   `eventLoopWindowStartedAt` in a nominal 30-second process-wide histogram window.
   Timer delays can extend that window. This is supporting evidence, not an exact
   lock-renewal trace or proof of a particular CPU-heavy processor.
7. Read archived JSON without re-enqueueing, deleting or modifying jobs:

   ```sh
   redis-cli ZRANGEBYSCORE \
     genfeed:monitoring:worker-evidence:<queue> \
     <start-epoch-ms> <end-epoch-ms>
   ```

   Use the deployment's approved read-only Redis access. The archive retains up to
   30 days and at most 5,000 records per queue; busy queues can trim earlier. Redis
   availability/persistence/eviction affects retention. At most 100 archive writes
   are pending per process; excess writes fall back to the single-line log. The
   warning `BullMQ worker evidence archive unavailable; use logs` signals that the
   archive may be incomplete. Archive failure does not change processing, and final
   diagnostic flush adds at most 500 ms after worker drain. Export incident records
   to the private evidence store before either retention limit is reached. Do not
   publish job/worker IDs or raw logs in public issues.
8. Inspect current job state with the queue's read-only `getJob`/`getState` APIs and
   durable application completion records. Distinguish queued/delayed recovery,
   terminal failure and a missing/auto-removed job. A BullMQ `completed` event proves
   processor completion only; compare provider requests, external operation IDs
   and durable application writes to establish exactly-once side effects. Do not
   infer data loss or absence of duplication from zero later stalls.

The existing 15-minute queue-health snapshot is a current-state view and is
overwritten after recovery. It is not an incident archive. If logs or job records
have expired, explicitly record which evidence is unavailable; never reconstruct
an unobserved cause or trigger production test jobs to fill the gap.
