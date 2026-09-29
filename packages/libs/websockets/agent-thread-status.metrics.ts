import * as Sentry from '@sentry/nestjs';

/**
 * Server-side counters for the thread status push (#5636). Sentry drops the
 * call when it is not initialised, and a metrics failure must never affect
 * delivery.
 */
export type AgentThreadStatusServerMetric =
  /** A status change was published to the channel. */
  | 'published'
  /** Publishing a status change failed. */
  | 'publish_failed'
  /** The gateway emitted a status event, counted per recipient socket. */
  | 'delivered'
  /** The gateway dropped a status event it could not scope. */
  | 'dropped';

export function countAgentThreadStatus(
  metric: AgentThreadStatusServerMetric,
  value = 1,
  attributes: Record<string, string> = {},
): void {
  try {
    Sentry.metrics.count(`agent.thread_status.${metric}`, value, {
      attributes,
    });
  } catch {
    // Metrics are best-effort.
  }
}
