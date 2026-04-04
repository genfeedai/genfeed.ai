import type {
  IBrand,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  ISubscription,
  IUser,
} from '@genfeedai/interfaces';
import {
  AssetScope,
  SubscriptionCategory,
  SubscriptionStatus,
} from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Subscription: class BaseSubscription {
    public organization?: unknown;
    public brand?: unknown;
    public user?: unknown;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@genfeedai/interfaces', () => ({}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import {
  Subscription,
  SubscriptionPreview,
} from '@models/billing/subscription.model';

type SubscriptionFixtureInput = ConstructorParameters<typeof Subscription>[0];

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

const createOrganization = (
  partial: Partial<IOrganization> = {},
): IOrganization => ({
  ...createBaseEntity<IOrganization>(partial),
  isSelected: false,
  label: 'Test Organization',
  settings: createOrganizationSetting(),
  user: createUser(),
  ...partial,
});

const createBrand = (partial: Partial<IBrand> = {}): IBrand => ({
  ...createBaseEntity<IBrand>(partial),
  backgroundColor: '#000000',
  credentials: [],
  description: 'Brand description',
  fontFamily: 'Inter',
  handle: 'test-brand',
  isActive: true,
  isDarkroomEnabled: false,
  isDefault: false,
  isSelected: false,
  isVerified: false,
  label: 'Test Brand',
  links: [],
  organization: createOrganization(),
  primaryColor: '#ffffff',
  scope: AssetScope.BRAND,
  secondaryColor: '#cccccc',
  user: createUser(),
  ...partial,
});

const createSubscription = (partial: SubscriptionFixtureInput = {}) => {
  const fixture: SubscriptionFixtureInput = {
    ...createBaseEntity<ISubscription>(partial as Partial<ISubscription>),
    category: SubscriptionCategory.MONTHLY,
    organization: createOrganization(),
    status: SubscriptionStatus.ACTIVE,
    stripeCustomerId: 'cus_123',
    stripePriceId: 'price_123',
    stripeSubscriptionId: 'sub_123',
    user: createUser(),
    ...partial,
  };

  return new Subscription(fixture);
};

describe('SubscriptionPreview', () => {
  it('should create with default empty price', () => {
    const preview = new SubscriptionPreview();
    expect(preview.price).toBe('');
  });

  it('should accept price from partial', () => {
    const preview = new SubscriptionPreview({ price: '$49.99/mo' });
    expect(preview.price).toBe('$49.99/mo');
  });
});

describe('Subscription', () => {
  describe('constructor', () => {
    it('should create a subscription instance', () => {
      const sub = createSubscription();
      expect(sub).toBeDefined();
    });

    it('should instantiate populated organization', () => {
      const sub = createSubscription({
        organization: createOrganization({ id: 'org-1', label: 'Test Org' }),
      });
      expect(sub.organization).toBeDefined();
      expect((sub.organization as { id: string }).id).toBe('org-1');
    });

    it('should instantiate populated brand', () => {
      const sub = createSubscription({
        brand: createBrand({ id: 'brand-1' }),
      });
      expect(sub.brand).toBeDefined();
      expect((sub.brand as { id: string }).id).toBe('brand-1');
    });

    it('should instantiate populated user', () => {
      const sub = createSubscription({
        user: createUser({ id: 'user-1' }),
      });
      expect(sub.user).toBeDefined();
      expect((sub.user as { id: string }).id).toBe('user-1');
    });

    it('should not instantiate when value is not an object with id', () => {
      const sub = createSubscription({
        organization: 'org-string-id' as never,
      });
      expect(sub.organization).toBe('org-string-id');
    });

    it('should not instantiate when value is null', () => {
      const sub = createSubscription({
        brand: null as never,
      });
      expect(sub.brand).toBeNull();
    });
  });
});
