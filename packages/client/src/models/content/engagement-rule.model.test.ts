import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

import { EngagementRule } from './engagement-rule.model';

describe('EngagementRule (client model)', () => {
  it('constructs with partial data', () => {
    const rule = new EngagementRule({
      id: 'rule-1',
      postGroupId: 'group-1',
      threshold: 100,
    });
    expect(rule.id).toBe('rule-1');
    expect(rule.postGroupId).toBe('group-1');
    expect(rule.threshold).toBe(100);
  });
});
