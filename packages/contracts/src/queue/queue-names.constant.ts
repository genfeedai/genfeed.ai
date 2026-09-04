/**
 * Canonical BullMQ queue names shared by producers (api) and consumers
 * (workers). The string values are wire-level contracts persisted in Redis
 * job keys — never change a value without draining the queue first.
 */

export const DEFAULT_QUEUE = 'default';

// ---------- Workflows ----------
export const WORKFLOW_EXECUTION_QUEUE = 'workflow-execution';

// ---------- Distribution & messaging ----------
export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const WEBHOOK_CLIENT_QUEUE = 'webhook-client';

// ---------- Platform ----------
export const HEYGEN_POLL_QUEUE = 'heygen-poll';
export const REPLICATE_POLL_QUEUE = 'replicate-poll';
export const CREDIT_DEDUCTION_QUEUE = 'credit-deduction';

export const ALL_QUEUE_NAMES = [
  DEFAULT_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  HEYGEN_POLL_QUEUE,
  REPLICATE_POLL_QUEUE,
  CREDIT_DEDUCTION_QUEUE,
] as const;

export type QueueName = (typeof ALL_QUEUE_NAMES)[number];

/**
 * Contract queues that have a producer but no registered BullMQ consumer.
 *
 * `default` is the only one. `QueueService.add` and `QueueService.dispatch` both
 * fall back to it, and `queue-diagnostics.controller.ts` probes it, so jobs keep
 * arriving — but no `@Processor(DEFAULT_QUEUE)` exists in the workers runtime, so
 * they sit in `waiting` forever. `pattern-extraction-queue-repair` exists because
 * of exactly that: work misrouted into `default` and stranded.
 *
 * That gap latched `genfeed-production-queues-oldest-waiting` into ALARM on
 * 2026-08-10 against a ~69-day-old job. The aggregate `OldestWaitingAgeSeconds`
 * metric takes the MAX across every queue, so one permanently stranded queue
 * pinned the alarm and it could never return to OK — and an alarm that cannot
 * return to OK can never notify about a *real* backlog again.
 *
 * Unconsumed queues are therefore excluded from the aggregate alert metrics and
 * from per-queue breach alerting, and published per-queue instead so the gap
 * stays visible on the dashboard rather than disappearing.
 *
 * Delete an entry the moment its processor lands.
 * `queue-consumer-coverage.spec.ts` fails if this list drifts from the
 * processors actually registered in the workers runtime.
 */
export const UNCONSUMED_QUEUE_NAMES = [DEFAULT_QUEUE] as const;

const UNCONSUMED_QUEUE_NAME_SET: ReadonlySet<string> = new Set(
  UNCONSUMED_QUEUE_NAMES,
);

/**
 * Queues a worker actually drains. These are the ones whose backlog and waiting
 * age describe an operational problem, so they alone feed the aggregate alarm
 * metrics.
 */
export const CONSUMED_QUEUE_NAMES: readonly QueueName[] =
  ALL_QUEUE_NAMES.filter((name) => !UNCONSUMED_QUEUE_NAME_SET.has(name));

export function hasQueueConsumer(queueName: string): boolean {
  return !UNCONSUMED_QUEUE_NAME_SET.has(queueName);
}
