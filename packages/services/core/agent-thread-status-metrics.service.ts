import * as Sentry from '@sentry/nextjs';

/**
 * Client-side counters for the thread status push (#5636). The server counts
 * what it publishes and delivers; these count what the client does with it.
 */
export type AgentThreadStatusClientMetric =
  /** A status event arrived. */
  | 'received'
  /** A status event changed a thread row. */
  | 'applied'
  /** A status event was ignored: its sequence was not newer. */
  | 'dropped_out_of_order'
  /** A status event named a thread the list does not hold. */
  | 'unknown_thread'
  /** The thread list was reloaded because the channel (re)connected. */
  | 'reconnect_reload'
  /** The thread list was refetched because the channel was unavailable. */
  | 'fallback_refetch';

export function countAgentThreadStatusClient(
  metric: AgentThreadStatusClientMetric,
): void {
  try {
    Sentry.metrics.count(`agent.thread_status.client.${metric}`, 1);
  } catch {
    // Metrics are best-effort.
  }
}
