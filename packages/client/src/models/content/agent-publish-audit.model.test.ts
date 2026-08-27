import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

import { AgentPublishAudit } from './agent-publish-audit.model';

describe('AgentPublishAudit (client model)', () => {
  it('constructs with partial data', () => {
    const audit = new AgentPublishAudit({
      id: 'audit-1',
      policyName: 'autonomy-brand-channel',
      reason: 'Brand auto-publish is disabled.',
    });
    expect(audit.id).toBe('audit-1');
    expect(audit.policyName).toBe('autonomy-brand-channel');
    expect(audit.reason).toBe('Brand auto-publish is disabled.');
  });
});
