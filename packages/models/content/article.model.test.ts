import type {
  IArticle,
  IAsset,
  IBrand,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  ITag,
  IUser,
} from '@genfeedai/interfaces';
import {
  ArticleCategory,
  ArticleStatus,
  AssetCategory,
  AssetParent,
  AssetScope,
} from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Article: class BaseArticle {
    public content?: string;
    public banner?: { url?: string };
    public user?: { handle?: string };
    public brand?: unknown;
    public tags?: unknown[];
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public handle?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/content/tag.model', () => ({
  Tag: class Tag {
    public label?: string;
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

import { Article } from '@models/content/article.model';

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

const createAsset = (partial: Partial<IAsset> = {}): IAsset => ({
  ...createBaseEntity<IAsset>(partial),
  category: AssetCategory.BANNER,
  parent: 'article-1',
  parentModel: AssetParent.ARTICLE,
  url: 'https://cdn.example.com/banner.jpg',
  user: createUser(),
  ...partial,
});

const createTag = (partial: Partial<ITag> = {}): ITag => ({
  ...createBaseEntity<ITag>(partial),
  backgroundColor: '#000000',
  brand: createBrand(),
  category: 'Article' as never,
  label: 'tag',
  organization: createOrganization(),
  textColor: '#ffffff',
  user: createUser(),
  ...partial,
});

const createArticle = (partial: Partial<IArticle> = {}) =>
  new Article({
    ...createBaseEntity<IArticle>(partial),
    category: ArticleCategory.GUIDE,
    content: 'Hello world',
    label: 'Test article',
    organization: createOrganization(),
    scope: AssetScope.BRAND,
    slug: 'test-article',
    status: ArticleStatus.DRAFT,
    summary: 'Summary',
    user: createUser(),
    ...partial,
  });

describe('Article', () => {
  describe('constructor', () => {
    it('should create an article instance', () => {
      const article = createArticle({ content: 'Hello world' });
      expect(article.content).toBe('Hello world');
    });

    it('should instantiate populated brand', () => {
      const article = createArticle({
        brand: createBrand({ id: 'brand-1', label: 'Test Brand' }),
      });
      expect(article.brand).toBeDefined();
    });

    it('should instantiate populated user', () => {
      const article = createArticle({
        user: createUser({ handle: 'johndoe' }),
      });
      expect(article.user).toBeDefined();
    });

    it('should instantiate populated tags array', () => {
      const article = createArticle({
        tags: [createTag({ label: 'tag1' }), createTag({ label: 'tag2' })],
      });
      expect(article.tags).toHaveLength(2);
    });

    it('should not wrap brand when not an object', () => {
      const article = createArticle({ brand: 'brand-id' as never });
      expect(article.brand).toBe('brand-id');
    });
  });

  describe('bannerUrl', () => {
    it('should return banner url when banner has url', () => {
      const article = createArticle({
        banner: createAsset({ url: 'https://cdn.example.com/banner.jpg' }),
      });
      expect(article.bannerUrl).toBe('https://cdn.example.com/banner.jpg');
    });

    it('should return undefined when banner is missing', () => {
      const article = createArticle({ banner: undefined });
      expect(article.bannerUrl).toBeUndefined();
    });

    it('should return undefined when banner has no url', () => {
      const article = createArticle({
        banner: createAsset({ url: undefined }),
      });
      expect(article.bannerUrl).toBeUndefined();
    });
  });

  describe('wordCount', () => {
    it('should return 0 when content is empty', () => {
      const article = createArticle({ content: '' });
      expect(article.wordCount).toBe(0);
    });

    it('should return 0 when content is undefined', () => {
      const article = createArticle({ content: undefined as never });
      expect(article.wordCount).toBe(0);
    });

    it('should count words correctly', () => {
      const article = createArticle({
        content: 'Hello world this is a test',
      });
      expect(article.wordCount).toBe(6);
    });

    it('should handle multiple spaces between words', () => {
      const article = createArticle({
        content: 'Hello   world   test',
      });
      expect(article.wordCount).toBe(3);
    });

    it('should handle single word', () => {
      const article = createArticle({ content: 'Hello' });
      expect(article.wordCount).toBe(1);
    });
  });

  describe('readingTime', () => {
    it('should return 0 for empty content', () => {
      const article = createArticle({ content: '' });
      expect(article.readingTime).toBe(0);
    });

    it('should return 1 for short content', () => {
      const article = createArticle({
        content: 'A short sentence.',
      });
      expect(article.readingTime).toBe(1);
    });

    it('should calculate reading time at 200 wpm', () => {
      const words = Array.from({ length: 400 }, () => 'word').join(' ');
      const article = createArticle({ content: words });
      expect(article.readingTime).toBe(2);
    });

    it('should round up fractional reading times', () => {
      const words = Array.from({ length: 201 }, () => 'word').join(' ');
      const article = createArticle({ content: words });
      expect(article.readingTime).toBe(2);
    });
  });

  describe('author', () => {
    it('should return user handle', () => {
      const article = createArticle({
        user: createUser({ handle: 'jane_doe' }),
      });
      expect(article.author).toBe('jane_doe');
    });

    it('should return undefined when user is missing', () => {
      const article = createArticle({ user: undefined as never });
      expect(article.author).toBeUndefined();
    });

    it('should return undefined when user has no handle', () => {
      const article = createArticle({ user: createUser({ handle: '' }) });
      expect(article.author).toBeUndefined();
    });
  });
});
