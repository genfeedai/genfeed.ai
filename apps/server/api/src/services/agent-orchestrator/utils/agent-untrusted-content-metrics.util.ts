import type {
  AgentUntrustedContentOrigin,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';
import * as Sentry from '@sentry/nestjs';

/**
 * Why the gate did not classify everything the model was about to read.
 * - `oversize`: content past the window cap (or an MCP result past the size
 *   limit, sent as a bounded sample) left an unclassified tail.
 * - `adapter`: the gate itself failed and the content passed through.
 */
export type AgentUntrustedContentGapCategory = 'adapter' | 'oversize';

/** Every gate metric carries the origin and the mode that produced it. */
export interface AgentUntrustedContentMetricAttributes {
  category?: AgentUntrustedContentGapCategory;
  mode?: TypedDecisionMode;
  origin: AgentUntrustedContentOrigin;
}

const METRIC_PREFIX = 'agent.untrusted_content_gate';

function toSentryAttributes(
  attributes: AgentUntrustedContentMetricAttributes,
): Record<string, string> {
  const result: Record<string, string> = { origin: attributes.origin };
  if (attributes.category) {
    result.category = attributes.category;
  }
  if (attributes.mode) {
    result.mode = attributes.mode;
  }
  return result;
}

function count(
  metric: string,
  value: number,
  attributes: AgentUntrustedContentMetricAttributes,
): void {
  try {
    Sentry.metrics.count(`${METRIC_PREFIX}.${metric}`, value, {
      attributes: toSentryAttributes(attributes),
    });
  } catch {
    // Metrics are best-effort and must never change the gate's outcome.
  }
}

/** Content reached the model with some of it unclassified (fail-open). */
export function countUntrustedContentFailOpen(
  attributes: AgentUntrustedContentMetricAttributes,
): void {
  count('fail_open', 1, attributes);
}

/** Content with an unclassified tail was withheld (fail-closed). */
export function countUntrustedContentFailClosed(
  attributes: AgentUntrustedContentMetricAttributes,
): void {
  count('fail_closed', 1, attributes);
}

/** Provider classifier calls spent on one tool result. */
export function countUntrustedContentClassifierCalls(
  calls: number,
  attributes: AgentUntrustedContentMetricAttributes,
): void {
  count('classifier_calls', calls, attributes);
}
