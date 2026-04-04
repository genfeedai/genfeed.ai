import type {
  ICredit,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  IUser,
} from '@cloud/interfaces';
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

const createBaseEntity = <T extends { id: string }>(
  partial: Partial<T> = {},
): Pick<T, 'id'> & {
  createdAt: string;
  isDeleted: boolean;
  updatedAt: string;
} => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id: (partial.id ?? 'entity-1') as string,
  isDeleted: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const createSetting = (partial: Partial<ISetting> = {}): ISetting => ({
  ...createBaseEntity<ISetting>(partial),
  contentPreferences: [],
  isAdvancedMode: false,
  isFirstLogin: false,
  isMenuCollapsed: false,
  isTrendNotificationsEmail: false,
  isTrendNotificationsInApp: false,
  isTrendNotificationsTelegram: false,
  isVerified: false,
  theme: 'light',
  trendNotificationsFrequency: 'daily',
  trendNotificationsMinViralScore: 0,
  ...partial,
});

const createUser = (partial: Partial<IUser> = {}): IUser => ({
  ...createBaseEntity<IUser>(partial),
  clerkId: 'clerk_123',
  email: 'test@example.com',
  firstName: 'Test',
  handle: 'test-user',
  lastName: 'User',
  settings: createSetting(),
  ...partial,
});

const createOrganizationSetting = (
  partial: Partial<IOrganizationSetting> = {},
): IOrganizationSetting => ({
  ...createBaseEntity<IOrganizationSetting>(partial),
  brandsLimit: 1,
  isAdvancedMode: false,
  isAutoEvaluateEnabled: false,
  isDarkroomNsfwVisible: false,
  isGenerateArticlesEnabled: true,
  isGenerateImagesEnabled: true,
  isGenerateMusicEnabled: true,
  isGenerateVideosEnabled: true,
  isNotificationsDiscordEnabled: false,
  isNotificationsEmailEnabled: false,
  isVerifyIngredientEnabled: false,
  isVerifyScriptEnabled: false,
  isVerifyVideoEnabled: false,
  isVoiceControlEnabled: false,
  isWatermarkEnabled: false,
  isWebhookEnabled: false,
  isWhitelabelEnabled: false,
  seatsLimit: 1,
  ...partial,
});

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
        settings: createOrganizationSetting({ isAdvancedMode: true }),
      });
      expect(org.settings).toBeDefined();
    });

    it('should instantiate credits when provided as object', () => {
      const org = createOrganization({
        credits: createCredit({ balance: 1000 }),
      });
      expect(org.credits).toBeDefined();
      expect(org.credits!.balance).toBe(1000);
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
