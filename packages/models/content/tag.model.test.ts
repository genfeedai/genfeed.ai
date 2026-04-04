import type {
  IBrand,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  ITag,
  IUser,
} from '@genfeedai/interfaces';
import { AssetScope, TagCategory } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Tag: class BaseTag {
    public user?: unknown;
    public organization?: unknown;
    public brand?: unknown;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

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

import { Tag } from '@models/content/tag.model';

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

const createTag = (partial: Partial<ITag> = {}) =>
  new Tag({
    ...createBaseEntity<ITag>(partial),
    backgroundColor: '#000000',
    brand: createBrand(),
    category: TagCategory.INGREDIENT,
    label: 'My Tag',
    organization: createOrganization(),
    textColor: '#ffffff',
    user: createUser(),
    ...partial,
  });

describe('Tag', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = createTag();
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = createTag({ id: 'test-123', label: 'My Tag' });
      expect(instance).toBeDefined();
    });

    it('should instantiate populated user', () => {
      const tag = createTag({ user: createUser({ id: 'user-1' }) });
      expect(tag.user).toBeDefined();
      expect((tag.user as { id: string }).id).toBe('user-1');
    });

    it('should not wrap user when it has no id', () => {
      const tag = createTag({ user: 'user-string' as never });
      expect(tag.user).toBe('user-string');
    });

    it('should instantiate populated organization', () => {
      const tag = createTag({
        organization: createOrganization({ id: 'org-1' }),
      });
      expect(tag.organization).toBeDefined();
      expect((tag.organization as { id: string }).id).toBe('org-1');
    });

    it('should not wrap organization when it has no id', () => {
      const tag = createTag({ organization: 'org-string' as never });
      expect(tag.organization).toBe('org-string');
    });

    it('should instantiate populated brand', () => {
      const tag = createTag({
        brand: createBrand({ id: 'brand-1' }),
      });
      expect(tag.brand).toBeDefined();
      expect((tag.brand as { id: string }).id).toBe('brand-1');
    });

    it('should not wrap brand when it has no id', () => {
      const tag = createTag({ brand: 'brand-string' as never });
      expect(tag.brand).toBe('brand-string');
    });

    it('should handle all relations being objects simultaneously', () => {
      const tag = createTag({
        brand: createBrand({ id: 'brand-1' }),
        organization: createOrganization({ id: 'org-1' }),
        user: createUser({ id: 'user-1' }),
      });
      expect(tag.user).toBeDefined();
      expect(tag.organization).toBeDefined();
      expect(tag.brand).toBeDefined();
    });
  });
});
