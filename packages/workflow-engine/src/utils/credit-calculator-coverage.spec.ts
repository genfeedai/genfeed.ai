/**
 * Registry coverage spec — ensures every node type registered in
 * EXECUTOR_REGISTRY has an explicit entry in DEFAULT_CREDIT_COSTS.
 *
 * If this test fails, add the missing type to DEFAULT_CREDIT_COSTS in
 * credit-calculator.ts and annotate guesses with [ESTIMATED].
 */
import { EXECUTOR_REGISTRY } from '@workflow-engine/executors/executor-registry';
import { DEFAULT_CREDIT_COSTS } from '@workflow-engine/utils/credit-calculator';
import { describe, expect, it } from 'vitest';

describe('DEFAULT_CREDIT_COSTS registry coverage', () => {
  it('has an explicit cost entry for every registered executor node type', () => {
    const registeredTypes = Object.keys(EXECUTOR_REGISTRY);
    const coveredTypes = Object.keys(DEFAULT_CREDIT_COSTS);

    const missing = registeredTypes.filter(
      (nodeType) => !coveredTypes.includes(nodeType),
    );

    expect(
      missing,
      `Missing credit costs for node types: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

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
});
