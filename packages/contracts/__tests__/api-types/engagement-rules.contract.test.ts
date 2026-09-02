import { describe, expect, it } from 'vitest';
import {
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleState,
} from '../../src';
import { evaluateEngagementRule } from '../../src/api-types/contracts/engagement-rules.contract';

const snapshot = {
  comments: 4,
  engagementRate: 0.12,
  likes: 120,
  shares: 8,
  views: 900,
};

const eligible = {
  canWriteComments: true,
  canWriteReposts: true,
  isConnected: true,
};

describe('evaluateEngagementRule', () => {
  it('fires exactly when the metric crosses the threshold', () => {
    const result = evaluateEngagementRule({
      eligibility: eligible,
      now: new Date('2026-08-27T12:00:00.000Z'),
      rule: {
        actionType: EngagementRuleAction.REPOST,
        isEnabled: true,
        metric: EngagementMetric.LIKES,
        state: EngagementRuleState.ARMED,
        threshold: 100,
        windowEndsAt: null,
      },
      snapshot,
    });
    expect(result).toEqual({ kind: 'fire', snapshot });
  });

  it('skips a rule that already left ARMED', () => {
    const result = evaluateEngagementRule({
      eligibility: eligible,
      now: new Date('2026-08-27T12:00:00.000Z'),
      rule: {
        actionType: EngagementRuleAction.REPOST,
        isEnabled: true,
        metric: EngagementMetric.LIKES,
        state: EngagementRuleState.TRIGGERED,
        threshold: 100,
        windowEndsAt: null,
      },
      snapshot,
    });
    expect(result).toEqual({ kind: 'skip' });
  });

  it('expires an armed rule past its window even if the metric is met', () => {
    const result = evaluateEngagementRule({
      eligibility: eligible,
      now: new Date('2026-08-27T12:00:00.000Z'),
      rule: {
        actionType: EngagementRuleAction.REPOST,
        isEnabled: true,
        metric: EngagementMetric.LIKES,
        state: EngagementRuleState.ARMED,
        threshold: 100,
        windowEndsAt: new Date('2026-08-27T11:00:00.000Z'),
      },
      snapshot,
    });
    expect(result).toEqual({ kind: 'expire' });
  });

  it('records ineligible credentials instead of firing', () => {
    const result = evaluateEngagementRule({
      eligibility: {
        canWriteComments: false,
        canWriteReposts: true,
        isConnected: true,
      },
      now: new Date('2026-08-27T12:00:00.000Z'),
      rule: {
        actionType: EngagementRuleAction.FOLLOW_UP_COMMENT,
        isEnabled: true,
        metric: EngagementMetric.LIKES,
        state: EngagementRuleState.ARMED,
        threshold: 100,
        windowEndsAt: null,
      },
      snapshot,
    });
    expect(result.kind).toBe('ineligible');
  });
});
