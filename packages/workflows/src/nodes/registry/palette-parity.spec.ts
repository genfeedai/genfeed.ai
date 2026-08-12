/**
 * Palette parity for #2664: every SaaS node that is user-exposed must have
 * an executor registration path (credit cost) and a canvas type registration
 * is verified separately in cloud merged-node-types.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CREDIT_COSTS } from '../../engine/utils/credit-calculator';
import { SAAS_NODE_DEFINITIONS } from './saas-definitions';

const REQUIRED_PALETTE_NODES = ['socialRead', 'reportDelivery'] as const;

describe('palette parity (#2664)', () => {
  it('exposes socialRead and reportDelivery in the SaaS registry', () => {
    for (const type of REQUIRED_PALETTE_NODES) {
      expect(SAAS_NODE_DEFINITIONS[type], type).toBeDefined();
      expect(SAAS_NODE_DEFINITIONS[type].label.length).toBeGreaterThan(0);
      expect(SAAS_NODE_DEFINITIONS[type].description.length).toBeGreaterThan(0);
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
    expect(SAAS_NODE_DEFINITIONS.socialRead.category).toBe('input');
    expect(SAAS_NODE_DEFINITIONS.reportDelivery.category).toBe('output');
  });
});
