# AWS monitoring runbook

## Redis and BullMQ

Queue-health alarms are emitted from aggregate BullMQ metrics published by the
workers service. A stalled-job alarm can recover on its own after BullMQ
redelivers the affected job, but an old-waiting alarm means work remains queued
without making progress and needs queue-level investigation.

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
