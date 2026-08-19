# AWS monitoring runbook

## Redis and BullMQ

Queue-health alarms are emitted from BullMQ metrics published by the workers
service (`Genfeed/Queues`, dimension `Service=workers`). A stalled-job alarm
can recover on its own after BullMQ redelivers the affected job, but an
old-waiting alarm means work remains queued without making progress and needs
queue-level investigation.

### Identify the queue from `genfeed-production-queues-stalled`

The CloudWatch alarm watches the **aggregate** `StalledJobs5m` metric. That
sum includes every workers queue **and** the files-owned queues
(`file-processing`, `image-processing`, `task-processing`, `video-processing`,
`youtube-processing`). The alarm itself has no queue dimension.

When it fires, identify the queue in this order:

1. **Worker logs** in the same 5-minute window. Search for
   `BullMQ job stalled`. Each line includes `queueName` and `jobId`.
   That collector process is not the processing worker; do not treat a
   hostname or pid on the metrics replica as the job owner. Job payloads,
   tenant data, and secrets are never logged.
2. **Per-queue CloudWatch series.** `StalledJobs5m` is also published with
   dimensions `Service=workers` **and** `Queue=<queue-name>` when that queue
   recorded at least one stall in the window.
3. **Redis health snapshots** (15-minute TTL):
   `genfeed:monitoring:queue-health:snapshot:<queue-name>`. The JSON now
   includes `stalledEvents` and `stalledJobIds` (job ids only).

Do not guess from the aggregate count. Two stalls can be two queues or two
jobs on one queue.

### Recurring 2026-08-16..18 stalls (#3065)

Observed: 3 stalled jobs on 2026-08-16, 2 on 2026-08-17, 2 on 2026-08-18.
The alarm recovered to OK each time. CloudWatch correlation is still
open — this lane could not query the alarm timestamps or name the
affected queues.

**Verified from code**

- No worker set `lockDuration`, `stalledInterval`, or `maxStalledCount`.
  BullMQ defaults (`30s` / `30s` / `1`) applied everywhere.
- Multi-minute processors (`agent-run`, `workflow-execution`,
  `batch-workflow`, `batch-generation`, `clip-analyze`, `clip-factory`,
  `article-generation`, `content-pipeline`, plus files
  `video-processing` / `youtube-processing`) can exceed a 30s lock. Locks
  renew while the event loop is healthy; a 30s lease still stalls when
  renewal is delayed by event-loop pressure or a brief Redis blip.
- Workers and files both do `SIGTERM` → close HTTP → `app.close()` → exit.
  Files lock-duration changes still wait until the ECS stop-timeout
  follow-up lands.
- Stall telemetry was aggregate-only. Snapshots dropped `stalledEvents`,
  so operators could not name the queue from the alarm.

**Open follow-up (not claimed as root cause).** If the next named-queue
window lines up with an ECS workers/files task replacement, raise the
service stop timeout. Files now drains Nest/BullMQ on SIGTERM;
lock-duration changes still wait until that stop-timeout follow-up
lands. If the timestamps do not line up, inspect the processor named
by `queueName` + `jobId`.

**Observability shipped (Part of #3065)**

- Each stall is logged with `queueName` and `jobId` only. No processing
  worker identity is invented from the metrics collector replica.
- Per-queue `StalledJobs5m` and Redis `stalledJobIds` identify the
  affected queue on the next alarm.
- Workers-service long jobs use a 120s lock and 30s renew/stall check.
  `maxStalledCount` stays at BullMQ's default of 1 so a side-effecting
  job is not run a third time after two stalls. Files queues stay on
  BullMQ defaults until the ECS stop-timeout follow-up lands.

Before deleting queue data:

1. Confirm the producer's queue name has a processor registered in the deployed
   workers revision.
2. Deploy the routing fix before cleanup so the producer cannot recreate the
   backlog.
3. Identify jobs by queue, state, and exact job name. Never drain or obliterate
   the shared `default` queue to repair one job type.

### Repair stranded pattern extraction jobs

Pattern extraction belongs on the `pattern-extraction` queue. If older
deployments placed these jobs on `default`, run the compiled maintenance command
as a one-off task inside the same network and environment as the workers
service.

Dry-run first:

```bash
bun --filter @genfeedai/workers repair:pattern-extraction:dry
```

The report's `matched` value is the number of waiting jobs whose exact job name
is `pattern-extraction`. Dry-run mode does not delete or enqueue anything.

After reviewing the report, apply the repair:

```bash
bun --filter @genfeedai/workers repair:pattern-extraction
```

Live mode first enqueues one fresh, one-off scan on `pattern-extraction`, then
removes only those exact waiting jobs from `default`. The one-off job deliberately
bypasses the cron's daily deduplication so a retained failed daily job cannot be
mistaken for a successful replacement.
Run the dry-run again and confirm `matched` is zero. Then verify the waiting
count and oldest-waiting age return below their CloudWatch thresholds.

If the live command fails, do not drain the queue. Preserve its error output,
rerun the dry-run to inventory what remains, and investigate Redis connectivity
or a concurrently locked job before retrying.
