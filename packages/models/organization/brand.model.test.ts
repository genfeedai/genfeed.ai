import {
  AssetCategory,
  AssetParent,
  AssetScope,
  CredentialPlatform,
  LinkCategory,
} from '@genfeedai/enums';
import type {
  IAsset,
  IBrand,
  ICredential,
  ILink,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@genfeedai/client/models', () => ({
  Brand: class BaseBrand {
    public id?: string;
    public label?: string;
    public logo?: IAsset | string;
    public banner?: IAsset | string;
    public references?: IAsset[];
    public links?: ILink[];
    public credentials?: ICredential[];
    public user?: any;

    constructor(partial: Partial<IBrand>) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@helpers/ui/mobile/mobile.helper', () => ({
  getDeepLink: vi.fn((url: string, isMobile: boolean) =>
    isMobile ? `deeplink:${url}` : url,
  ),
  isMobileDevice: vi.fn(() => false),
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/ingredients/asset.model', () => ({
  Asset: class Asset {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/social/link.model', () => ({
  Link: class Link {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://ingredients.genfeed.ai',
  },
}));

import { getDeepLink, isMobileDevice } from '@helpers/ui/mobile/mobile.helper';

import { Brand } from '@models/organization/brand.model';

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

const createAsset = (partial: Partial<IAsset> = {}): IAsset => ({
  ...createBaseEntity<IAsset>(partial),
  category: AssetCategory.LOGO,
  parent: 'parent-123',
  parentModel: AssetParent.BRAND,
  url: 'https://example.com/asset.png',
  user: createUser(),
  ...partial,
});

const createLink = (partial: Partial<ILink> = {}): ILink => ({
  ...createBaseEntity<ILink>(partial),
  category: LinkCategory.WEBSITE,
  label: 'Homepage',
  url: 'https://example.com',
  ...partial,
});

const createCredential = (partial: Partial<ICredential> = {}): ICredential => ({
  ...createBaseEntity<ICredential>(partial),
  brand: 'brand-123',
  externalHandle: 'user123',
  externalId: 'external-123',
  isConnected: true,
  organization: createOrganization(),
  platform: CredentialPlatform.TWITTER,
  token: 'token',
  user: createUser(),
  ...partial,
});

const createBrandFixture = (partial: Partial<IBrand> = {}): IBrand => ({
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

const createBrand = (partial: Partial<IBrand> = {}) =>
  new Brand(createBrandFixture(partial));

describe('Brand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a brand instance', () => {
      const brand = createBrand({ id: 'brand-123', label: 'Test Brand' });

      expect(brand.id).toBe('brand-123');
      expect(brand.label).toBe('Test Brand');
    });

    it('should handle populated user', () => {
      const brand = createBrand({
        id: 'brand-123',
        user: createUser({ email: 'test@example.com', id: 'user-123' }),
      });

      expect(brand.user).toBeDefined();
      expect(brand.user.id).toBe('user-123');
    });

    it('should handle populated logo', () => {
      const brand = createBrand({
        id: 'brand-123',
        logo: {
          ...createAsset({
            id: 'asset-123',
            url: 'https://example.com/logo.png',
          }),
        },
      });

      expect(brand.logo).toBeDefined();
      expect((brand.logo as any).id).toBe('asset-123');
    });

    it('should handle populated banner', () => {
      const brand = createBrand({
        banner: {
          ...createAsset({
            category: AssetCategory.BANNER,
            id: 'banner-123',
            url: 'https://example.com/banner.png',
          }),
        },
        id: 'brand-123',
      });

      expect(brand.banner).toBeDefined();
      expect((brand.banner as any).id).toBe('banner-123');
    });

    it('should handle populated references', () => {
      const brand = createBrand({
        id: 'brand-123',
        references: [
          createAsset({ category: AssetCategory.REFERENCE, id: 'ref-1' }),
          createAsset({ category: AssetCategory.REFERENCE, id: 'ref-2' }),
        ],
      });

      expect(brand.references).toHaveLength(2);
    });

    it('should handle populated links', () => {
      const brand = createBrand({
        id: 'brand-123',
        links: [createLink({ id: 'link-1', url: 'https://example.com' })],
      });

      expect(brand.links).toHaveLength(1);
    });

    it('should default credentials to provided value or empty', () => {
      const brand = createBrand({ id: 'brand-123' });

      expect(brand.credentials).toEqual([]);
    });
  });

  describe('logoUrl', () => {
    it('should return logo URL when logo exists', () => {
      const brand = createBrand({
        id: 'brand-123',
        logo: createAsset({ id: 'logo-123' }),
      });

      expect(brand.logoUrl).toBe(
        'https://ingredients.genfeed.ai/logos/logo-123',
      );
    });

    it('should return undefined when no logo', () => {
      const brand = createBrand({ id: 'brand-123' });

      expect(brand.logoUrl).toBeUndefined();
    });
  });

  describe('bannerUrl', () => {
    it('should return banner URL when banner exists', () => {
      const brand = createBrand({
        banner: createAsset({
          category: AssetCategory.BANNER,
          id: 'banner-123',
        }),
        id: 'brand-123',
      });

      expect(brand.bannerUrl).toBe(
        'https://ingredients.genfeed.ai/banners/banner-123',
      );
    });

    it('should return undefined when no banner', () => {
      const brand = createBrand({ id: 'brand-123' });

      expect(brand.bannerUrl).toBeUndefined();
    });
  });

  describe('primaryReferenceUrl', () => {
    it('should return first reference URL', () => {
      const brand = createBrand({
        id: 'brand-123',
        references: [
          createAsset({ category: AssetCategory.REFERENCE, id: 'ref-1' }),
          createAsset({ category: AssetCategory.REFERENCE, id: 'ref-2' }),
        ],
      });

      expect(brand.primaryReferenceUrl).toBe(
        'https://ingredients.genfeed.ai/references/ref-1',
      );
    });

    it('should return undefined when no references', () => {
      const brand = createBrand({ id: 'brand-123', references: [] });

      expect(brand.primaryReferenceUrl).toBeUndefined();
    });
  });

  describe('totalCredentials', () => {
    it('should return count of credentials', () => {
      const brand = createBrand({
        credentials: [
          createCredential({
            id: 'cred-1',
            platform: CredentialPlatform.TWITTER,
          }),
          createCredential({
            id: 'cred-2',
            platform: CredentialPlatform.YOUTUBE,
          }),
        ],
        id: 'brand-123',
      });

      expect(brand.totalCredentials).toBe(2);
    });

    it('should return 0 when no credentials', () => {
      const brand = createBrand({ credentials: [], id: 'brand-123' });

      expect(brand.totalCredentials).toBe(0);
    });
  });

  describe('social handles and URLs', () => {
    const createBrandWithCredentials = (credentials: Partial<ICredential>[]) =>
      new Brand({
        credentials: credentials as ICredential[],
        id: 'brand-123',
      });

    describe('YouTube', () => {
      it('should return youtube handle', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'MyChannel', platform: CredentialPlatform.YOUTUBE },
        ]);

        expect(brand.youtubeHandle).toBe('MyChannel');
      });

      it('should return youtube URL', () => {
        const brand = createBrandWithCredentials([
          {
            externalHandle: 'MyChannel',
            externalId: 'UC123456',
            platform: CredentialPlatform.YOUTUBE,
          },
        ]);

        expect(brand.youtubeUrl).toBe(
          'https://www.youtube.com/channel/UC123456',
        );
      });

      it('should return undefined when no YouTube credential', () => {
        const brand = createBrandWithCredentials([]);

        expect(brand.youtubeHandle).toBeUndefined();
        expect(brand.youtubeUrl).toBeUndefined();
      });
    });

    describe('TikTok', () => {
      it('should return tiktok handle', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'myaccount', platform: CredentialPlatform.TIKTOK },
        ]);

        expect(brand.tiktokHandle).toBe('myaccount');
      });

      it('should return tiktok URL', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'myaccount', platform: CredentialPlatform.TIKTOK },
        ]);

        expect(brand.tiktokUrl).toBe('https://tiktok.com/@myaccount');
      });
    });

    describe('Instagram', () => {
      it('should return instagram handle', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'myinsta', platform: CredentialPlatform.INSTAGRAM },
        ]);

        expect(brand.instagramHandle).toBe('myinsta');
      });

      it('should return instagram URL', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'myinsta', platform: CredentialPlatform.INSTAGRAM },
        ]);

        expect(brand.instagramUrl).toBe('https://instagram.com/myinsta');
      });
    });

    describe('Twitter', () => {
      it('should return twitter handle', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'mytwitter', platform: CredentialPlatform.TWITTER },
        ]);

        expect(brand.twitterHandle).toBe('mytwitter');
      });

      it('should return twitter URL', () => {
        const brand = createBrandWithCredentials([
          { externalHandle: 'mytwitter', platform: CredentialPlatform.TWITTER },
        ]);

        expect(brand.twitterUrl).toBe('https://x.com/mytwitter');
      });
    });

    describe('LinkedIn', () => {
      it('should return linkedin handle', () => {
        const brand = createBrandWithCredentials([
          {
            externalHandle: 'myprofile',
            platform: CredentialPlatform.LINKEDIN,
          },
        ]);

        expect(brand.linkedinHandle).toBe('myprofile');
      });

      it('should return linkedin URL', () => {
        const brand = createBrandWithCredentials([
          {
            externalHandle: 'myprofile',
            platform: CredentialPlatform.LINKEDIN,
          },
        ]);

        expect(brand.linkedinUrl).toBe('https://linkedin.com/in/myprofile');
      });
    });
  });

  describe('deep links', () => {
    it('should return deep link for youtube on desktop', () => {
      vi.mocked(isMobileDevice).mockReturnValue(false);

      const brand = new Brand({
        credentials: [
          {
            externalId: 'UC123',
            platform: CredentialPlatform.YOUTUBE,
          } as ICredential,
        ],
        id: 'brand-123',
      });

      expect(brand.youtubeDeepLink).toBeDefined();
      expect(getDeepLink).toHaveBeenCalled();
    });

    it('should return deep link for tiktok', () => {
      const brand = new Brand({
        credentials: [
          {
            externalHandle: 'user',
            platform: CredentialPlatform.TIKTOK,
          } as ICredential,
        ],
        id: 'brand-123',
      });

      expect(brand.tiktokDeepLink).toBeDefined();
    });

    it('should return deep link for instagram', () => {
      const brand = new Brand({
        credentials: [
          {
            externalHandle: 'user',
            platform: CredentialPlatform.INSTAGRAM,
          } as ICredential,
        ],
        id: 'brand-123',
      });

      expect(brand.instagramDeepLink).toBeDefined();
    });

    it('should return deep link for twitter', () => {
      const brand = new Brand({
        credentials: [
          {
            externalHandle: 'user',
            platform: CredentialPlatform.TWITTER,
          } as ICredential,
        ],
        id: 'brand-123',
      });

      expect(brand.twitterDeepLink).toBeDefined();
    });

    it('should return deep link for linkedin', () => {
      const brand = new Brand({
        credentials: [
          {
            externalHandle: 'user',
            platform: CredentialPlatform.LINKEDIN,
          } as ICredential,
        ],
        id: 'brand-123',
      });

      expect(brand.linkedinDeepLink).toBeDefined();
    });

    it('should return undefined for deep link when no credential', () => {
      const brand = new Brand({ credentials: [], id: 'brand-123' });

      expect(brand.youtubeDeepLink).toBeUndefined();
      expect(brand.tiktokDeepLink).toBeUndefined();
      expect(brand.instagramDeepLink).toBeUndefined();
      expect(brand.twitterDeepLink).toBeUndefined();
      expect(brand.linkedinDeepLink).toBeUndefined();
    });
  });
});
