import type { AgentChatRegistryRow } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentChatRoutingTier, RouterPriority } from '@genfeedai/contracts';

/**
 * Tier → concrete registry key (#4865).
 *
 * The typed decision only ever answers a capability tier; this is the mapping
 * that turns it into something dispatchable. It is deliberately pure and
 * deterministic: the same candidate set and the same tier must always give the
 * same key, so a shadow-mode agreement number means something.
 *
 * Candidates arrive from `AgentChatModelRegistryService.listAutoCandidates()`,
 * which is the same eligibility filter that builds the gateway's
 * `allowed_models` list — never the full catalog.
 */

/** Cheapest first, then by label so equal-cost rows cannot reorder run to run. */
function sortByCost(
  rows: readonly AgentChatRegistryRow[],
): AgentChatRegistryRow[] {
  return [...rows].sort((left, right) => {
    if (left.cost !== right.cost) {
      return left.cost - right.cost;
    }
    return left.label.localeCompare(right.label);
  });
}

/**
 * Position in the cost-sorted pool a tier aims at: `simple` takes the
 * cheapest row, `complex` the priciest, `standard` the middle one.
 */
function resolveTierIndex(
  poolSize: number,
  tier: AgentChatRoutingTier,
): number {
  switch (tier) {
    case AgentChatRoutingTier.SIMPLE:
      return 0;
    case AgentChatRoutingTier.COMPLEX:
      return poolSize - 1;
    default:
      return Math.floor((poolSize - 1) / 2);
  }
}

/**
 * `prioritize` nudges by one step inside the pool rather than overriding the
 * tier: the decision judged the work, the priority is the user's preference
 * about how to pay for it. Speed shares Cost's direction because the cheap end
 * of this catalogue is also the small, fast end.
 */
function applyPriority(
  index: number,
  poolSize: number,
  prioritize?: RouterPriority,
): number {
  const shifted =
    prioritize === RouterPriority.QUALITY
      ? index + 1
      : prioritize === RouterPriority.COST ||
          prioritize === RouterPriority.SPEED
        ? index - 1
        : index;

  return Math.min(poolSize - 1, Math.max(0, shifted));
}

export function pickModelForTier(
  rows: readonly AgentChatRegistryRow[],
  tier: AgentChatRoutingTier,
  prioritize?: RouterPriority,
): string | undefined {
  const sorted = sortByCost(rows);
  if (sorted.length === 0) {
    return undefined;
  }

  // `complex` prefers rows that advertise reasoning, but only when the
  // registry actually has one — a catalogue without reasoning rows still has
  // to answer the turn rather than fall back to the gateway.
  const reasoningRows = sorted.filter((row) => row.isReasoning);
  const pool =
    tier === AgentChatRoutingTier.COMPLEX && reasoningRows.length > 0
      ? reasoningRows
      : sorted;

  const index = applyPriority(
    resolveTierIndex(pool.length, tier),
    pool.length,
    prioritize,
  );

  return pool[index]?.key;
}
