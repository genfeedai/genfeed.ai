import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  AgentPublishAudit: class BaseAgentPublishAudit {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { AgentPublishAudit } from './agent-publish-audit.model';

describe('AgentPublishAudit', () => {
  it('hydrates nested organization, brand, and user objects', () => {
    const audit = new AgentPublishAudit({
      brand: { id: 'brand-1' },
      id: 'audit-1',
      organization: { id: 'org-1' },
      user: { id: 'user-1' },
    });
    expect(audit.organization).toMatchObject({ id: 'org-1' });
    expect(audit.brand).toMatchObject({ id: 'brand-1' });
    expect(audit.user).toMatchObject({ id: 'user-1' });
  });
});
