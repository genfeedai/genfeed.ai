import type { ICredit, IOrganization } from '@genfeedai/contracts/interfaces';
import {
  createBaseEntity,
  createOrganizationSetting,
  createUser,
} from '@genfeedai/helpers/testing/entity-fixtures';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Organization: class BaseOrganization {
    public settings?: unknown;
    public credits?: { balance?: number };
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/billing/credit.model', () => ({
  Credit: class Credit {
    public balance: number;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
      this.balance = (partial.balance as number) ?? 0;
    }
  },
}));

vi.mock('@models/organization/organization-setting.model', () => ({
  OrganizationSetting: class OrganizationSetting {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Organization } from '@models/organization/organization.model';

const createCredit = (partial: Partial<ICredit> = {}): ICredit => ({
  ...createBaseEntity<ICredit>(partial),
  balance: 0,
  entity: 'org-1',
  entityModel: 'Organization',
  ...partial,
});

const createOrganization = (partial: Partial<IOrganization> = {}) =>
  new Organization({
    ...createBaseEntity<IOrganization>(partial),
    isSelected: false,
    label: 'Test Organization',
    settings: createOrganizationSetting(),
    user: createUser(),
    ...partial,
  });

describe('Organization', () => {
  describe('constructor', () => {
    it('should create an organization instance', () => {
      const org = createOrganization({ id: 'org-1' });
      expect(org).toBeDefined();
    });

    it('should instantiate settings when provided as object', () => {
      const org = createOrganization({
        settings: createOrganizationSetting({ isByokEnabled: true }),
      });
      expect(org.settings).toBeDefined();
    });

    it('should instantiate credits when provided as object', () => {
      const org = createOrganization({
        credits: createCredit({ balance: 1000 }),
      });
      expect(org.credits).toBeDefined();
      expect(org.credits?.balance).toBe(1000);
    });

    it('should not wrap settings when not an object', () => {
      const org = createOrganization({
        settings: 'setting-string',
      } as never);
      expect(org.settings).toBe('setting-string');
    });
  });

  describe('balance', () => {
    it('should return credits balance', () => {
      const org = createOrganization({
        credits: createCredit({ balance: 500 }),
      });
      expect(org.balance).toBe(500);
    });

    it('should return 0 when credits are missing', () => {
      const org = createOrganization();
      expect(org.balance).toBe(0);
    });

    it('should return 0 when credits balance is 0', () => {
      const org = createOrganization({
        credits: createCredit({ balance: 0 }),
      });
      expect(org.balance).toBe(0);
    });
  });

  describe('hasCredits', () => {
    it('should return true when balance is positive', () => {
      const org = createOrganization({
        credits: createCredit({ balance: 100 }),
      });
      expect(org.hasCredits).toBe(true);
    });

    it('should return false when balance is 0', () => {
      const org = createOrganization({
        credits: createCredit({ balance: 0 }),
      });
      expect(org.hasCredits).toBe(false);
    });

    it('should return false when credits are missing', () => {
      const org = createOrganization();
      expect(org.hasCredits).toBe(false);
    });
  });
});
