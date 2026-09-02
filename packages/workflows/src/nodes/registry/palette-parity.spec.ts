/**
 * Palette parity for #2664: every SaaS node that is user-exposed must have
 * an executor, a canvas type, and a credit cost.
 */
import { describe, expect, it } from 'vitest';
import { ReportDeliveryExecutor } from '../../engine/executors/saas/report-delivery-executor';
import { SocialReadExecutor } from '../../engine/executors/saas/social-read-executor';
import { DEFAULT_CREDIT_COSTS } from '../../engine/utils/credit-calculator';
import { ACTION_NODE_DEFINITIONS } from './action-node-definitions';

const REQUIRED_PALETTE_NODES = ['socialRead', 'reportDelivery'] as const;

const PALETTE_EXECUTORS = {
  reportDelivery: ReportDeliveryExecutor,
  socialRead: SocialReadExecutor,
} as const;

describe('palette parity (#2664)', () => {
  it('exposes socialRead and reportDelivery in the generated catalog', () => {
    for (const type of REQUIRED_PALETTE_NODES) {
      expect(ACTION_NODE_DEFINITIONS[type], type).toBeDefined();
      expect(ACTION_NODE_DEFINITIONS[type].label.length).toBeGreaterThan(0);
      expect(ACTION_NODE_DEFINITIONS[type].description.length).toBeGreaterThan(
        0,
      );
    }
  });

  it('assigns a credit cost for every required palette node', () => {
    for (const type of REQUIRED_PALETTE_NODES) {
      expect(
        DEFAULT_CREDIT_COSTS[type],
        `missing credit cost for ${type}`,
      ).toBeTypeOf('number');
      expect(DEFAULT_CREDIT_COSTS[type]).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps socialRead as input and reportDelivery as output', () => {
    expect(ACTION_NODE_DEFINITIONS.socialRead.category).toBe('input');
    expect(ACTION_NODE_DEFINITIONS.reportDelivery.category).toBe('output');
  });

  it('pairs every required palette node with an executor class and cost', () => {
    for (const type of REQUIRED_PALETTE_NODES) {
      const executor = new PALETTE_EXECUTORS[type]();
      expect(executor.nodeType).toBe(type);
      expect(
        executor.estimateCost({
          config: {},
          id: 'n',
          inputs: [],
          label: type,
          type,
        }),
      ).toBe(DEFAULT_CREDIT_COSTS[type]);
    }
  });
});
