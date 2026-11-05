import {
  createBrand,
  createOrganization,
  createUser,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  EngagementRule: class BaseEngagementRule {
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

import { EngagementRule } from './engagement-rule.model';

describe('EngagementRule', () => {
  it('hydrates nested organization, brand, and user objects', () => {
    const rule = new EngagementRule({
      brand: createBrand({ id: 'brand-1' }),
      id: 'rule-1',
      organization: createOrganization({ id: 'org-1' }),
      user: createUser({ id: 'user-1' }),
    });
    expect(rule.organization).toMatchObject({ id: 'org-1' });
    expect(rule.brand).toMatchObject({ id: 'brand-1' });
    expect(rule.user).toMatchObject({ id: 'user-1' });
  });
});
