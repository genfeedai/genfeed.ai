/**
 * Credit cost coverage spec.
 *
 * Guards two invariants for DEFAULT_CREDIT_COSTS:
 *   1. Every entry is a non-negative number.
 *   2. No cost entry exists for a node type removed in #481 (dead SaaS nodes).
 *
 * Canonical-type <-> registered-executor <-> credit-cost parity is enforced at
 * the API adapter layer, where both the registrars and the merged node registry
 * are visible (see workflow-core-executor-registrar.service.spec.ts).
 */
import { DEFAULT_CREDIT_COSTS } from '@workflow-engine/utils/credit-calculator';
import { describe, expect, it } from 'vitest';

/** Node types deleted in #481 — must never regain a credit cost. */
const REMOVED_NODE_TYPES = [
  'patternContext',
  'condition',
  'delay',
  'followUser',
  'likePost',
  'rssInput',
  'tweetInput',
  'tweetRemix',
  'socialPublish',
  'beatAnalysis',
  'beatSyncEditor',
  'imageTextOverlay',
  'slideshowImageBatch',
  'hookPerformanceTracker',
  'personaContentPlan',
  'personaPhotoSession',
  'personaVideoContent',
] as const;

describe('DEFAULT_CREDIT_COSTS coverage', () => {
  it('has a numeric cost for every covered node type', () => {
    for (const [nodeType, cost] of Object.entries(DEFAULT_CREDIT_COSTS)) {
      expect(typeof cost, `Cost for "${nodeType}" must be a number`).toBe(
        'number',
      );
      expect(
        cost,
        `Cost for "${nodeType}" must be >= 0`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('has no cost entry for node types removed in #481', () => {
    const coveredTypes = Object.keys(DEFAULT_CREDIT_COSTS);
    const resurrected = REMOVED_NODE_TYPES.filter((nodeType) =>
      coveredTypes.includes(nodeType),
    );

    expect(
      resurrected,
      `Removed node types must not have credit costs: ${resurrected.join(', ')}`,
    ).toHaveLength(0);
  });
});
