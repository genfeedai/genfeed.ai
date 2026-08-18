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
   `BullMQ job stalled`. Each line includes `queueName`, `jobId`, and
   `worker` (`HOSTNAME:pid`). Job payloads, tenant data, and secrets are
   never logged.
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
The alarm recovered to OK each time. This lane could not query CloudWatch;
the hypothesis below is from repo evidence.

**Verified from code**

- No worker set `lockDuration`, `stalledInterval`, or `maxStalledCount`.
  BullMQ defaults (`30s` / `30s` / `1`) applied everywhere.
- Multi-minute processors (`agent-run`, `workflow-execution`,
  `batch-workflow`, `batch-generation`, `clip-analyze`, `clip-factory`,
  `article-generation`, `content-pipeline`, plus files
  `video-processing` / `youtube-processing`) can exceed a 30s lock. Locks
  renew while the event loop is healthy; a 30s lease still stalls when
  renewal is delayed by event-loop pressure or a brief Redis blip.
- Workers do graceful `SIGTERM` → `app.close()`. If the platform stop
  timeout is shorter than an active long job, the process is killed and
  BullMQ marks those jobs stalled, then redelivers them. That matches a
  small daily count that recovers without a backlog.
- Stall telemetry was aggregate-only. Snapshots dropped `stalledEvents`,
  so operators could not name the queue from the alarm.

**Hypothesis.** The daily 2–3 recovered stalls are almost certainly
worker replacement (deploy / ECS recycle / SIGKILL after stop timeout)
or a short lock-renewal gap on a long job — not a permanently hung
processor. A hung job would stay active or fail, not recover the alarm
on its own.

**Code mitigation shipped for #3065**

- Long-job workers now use a 120s lock, 30s renew/stall check, and
  `maxStalledCount=2`.
- Each stall is logged with queue, job id, and worker identity.
- Per-queue `StalledJobs5m` and Redis `stalledJobIds` identify the
  affected queue on the next alarm.

**Next check if it recurs.** Correlate the alarm timestamp with an ECS
workers/files task replacement. If they line up, raise the service stop
timeout above the longest in-flight job instead of raising lock duration
again. If they do not line up, use the new `queueName` + `jobId` logs to
inspect that processor's completion path.

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
