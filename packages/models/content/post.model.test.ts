import {
  AssetScope,
  CredentialPlatform,
  IngredientStatus,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import type {
  IBrand,
  ICredential,
  IIngredient,
  IOrganization,
  IOrganizationSetting,
  IPost,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@genfeedai/client/models', () => ({
  Post: class BasePost {
    public id?: string;
    public label?: string;
    public status?: PostStatus;
    public platform?: CredentialPlatform;
    public externalId?: string;
    public externalShortcode?: string;
    public url?: string;
    public ingredients?: any[];
    public credential?: any;
    public user?: any;
    public organization?: any;
    public brand?: any;
    public children?: any[];

    constructor(partial: Partial<IPost>) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@genfeedai/helpers', () => ({
  SocialUrlHelper: {
    buildInstagramUrl: (id: string) => `https://instagram.com/p/${id}`,
    buildLinkedInUrl: (id: string) =>
      `https://linkedin.com/feed/update/urn:li:share:${id}`,
    buildTikTokUrl: (id: string, username: string) =>
      `https://tiktok.com/@${username}/video/${id}`,
    buildTwitterUrl: (id: string, username: string) =>
      `https://x.com/${username}/status/${id}`,
    buildYoutubeUrl: (id: string) => `https://youtube.com/watch?v=${id}`,
  },
}));

vi.mock('@models/auth/credential.model', () => ({
  Credential: class Credential {
    public id?: string;
    public externalHandle?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    public id?: string;
    constructor(partial: any) {
      Object.assign(this, partial);
    }
  },
}));

import { Post } from '@models/content/post.model';

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

const createIngredient = (partial: Partial<IIngredient> = {}): IIngredient => ({
  ...createBaseEntity<IIngredient>(partial),
  category: PostCategory.IMAGE as never,
  hasVoted: false,
  isDefault: false,
  isFavorite: false,
  isHighlighted: false,
  isVoteAnimating: false,
  organization: createOrganization(),
  scope: AssetScope.BRAND,
  status: IngredientStatus.GENERATED,
  totalChildren: 0,
  totalVotes: 0,
  user: createUser(),
  ...partial,
});

const createPostFixture = (partial: Partial<IPost> = {}): IPost => ({
  ...createBaseEntity<IPost>(partial),
  brand: createBrand(),
  category: PostCategory.POST,
  credential: createCredential(),
  ingredients: [],
  organization: createOrganization(),
  platform: CredentialPlatform.TWITTER,
  publicationDate: '2026-01-01T00:00:00.000Z',
  status: PostStatus.DRAFT,
  uploadedAt: '2026-01-01T00:00:00.000Z',
  user: createUser(),
  ...partial,
});

const createPost = (partial: Partial<IPost> = {}) =>
  new Post(createPostFixture(partial));

describe('Post', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a post instance', () => {
      const post = createPost({ id: 'post-123', label: 'Hello world' });

      expect(post.id).toBe('post-123');
      expect(post.label).toBe('Hello world');
    });

    it('should handle populated ingredients', () => {
      const post = createPost({
        id: 'post-123',
        ingredients: [
          createIngredient({ id: 'ing-1' }),
          createIngredient({ id: 'ing-2' }),
        ],
      });

      expect(post.ingredients).toHaveLength(2);
    });

    it('should handle populated credential', () => {
      const post = createPost({
        credential: createCredential({
          externalHandle: 'user',
          id: 'cred-123',
        }),
        id: 'post-123',
      });

      expect(post.credential).toBeDefined();
      expect(post.credential.id).toBe('cred-123');
    });

    it('should handle populated user', () => {
      const post = createPost({
        id: 'post-123',
        user: createUser({ id: 'user-123' }),
      });

      expect(post.user).toBeDefined();
      expect(post.user.id).toBe('user-123');
    });

    it('should handle populated organization', () => {
      const post = createPost({
        id: 'post-123',
        organization: createOrganization({ id: 'org-123' }),
      });

      expect(post.organization).toBeDefined();
      expect(post.organization.id).toBe('org-123');
    });

    it('should handle populated brand', () => {
      const post = createPost({
        brand: createBrand({ id: 'brand-123' }),
        id: 'post-123',
      });

      expect(post.brand).toBeDefined();
      expect(post.brand.id).toBe('brand-123');
    });

    it('should handle populated children', () => {
      const post = createPost({
        children: [
          createPostFixture({ id: 'child-1' }),
          createPostFixture({ id: 'child-2' }),
        ],
        id: 'post-123',
      });

      expect(post.children).toHaveLength(2);
      expect(post.children?.[0]).toBeInstanceOf(Post);
    });
  });

  describe('postUrl', () => {
    it('should return url if set', () => {
      const post = createPost({
        id: 'post-123',
        url: 'https://custom.url/post',
      });

      expect(post.postUrl).toBe('https://custom.url/post');
    });

    it('should return empty string if no externalId', () => {
      const post = createPost({ id: 'post-123' });

      expect(post.postUrl).toBe('');
    });

    it('should build YouTube URL', () => {
      const post = createPost({
        externalId: 'abc123',
        id: 'post-123',
        platform: CredentialPlatform.YOUTUBE,
      });

      expect(post.postUrl).toBe('https://youtube.com/watch?v=abc123');
    });

    it('should build TikTok URL', () => {
      const post = createPost({
        credential: createCredential({ externalHandle: 'user123' }),
        externalId: 'video123',
        id: 'post-123',
        platform: CredentialPlatform.TIKTOK,
      });

      expect(post.postUrl).toBe('https://tiktok.com/@user123/video/video123');
    });

    it('should build Twitter URL with username', () => {
      const post = createPost({
        credential: createCredential({ externalHandle: 'user123' }),
        externalId: 'tweet123',
        id: 'post-123',
        platform: CredentialPlatform.TWITTER,
      });

      expect(post.postUrl).toBe('https://x.com/user123/status/tweet123');
    });

    it('should build Twitter fallback URL without username', () => {
      const post = createPost({
        externalId: 'tweet123',
        id: 'post-123',
        platform: CredentialPlatform.TWITTER,
      });

      expect(post.postUrl).toBe('https://x.com/i/status/tweet123');
    });

    it('should build Instagram URL with shortcode', () => {
      const post = createPost({
        externalId: 'id123',
        externalShortcode: 'ABC123',
        id: 'post-123',
        platform: CredentialPlatform.INSTAGRAM,
      });

      expect(post.postUrl).toBe('https://instagram.com/p/ABC123');
    });

    it('should build Instagram URL with externalId fallback', () => {
      const post = createPost({
        externalId: 'id123',
        id: 'post-123',
        platform: CredentialPlatform.INSTAGRAM,
      });

      expect(post.postUrl).toBe('https://instagram.com/p/id123');
    });

    it('should build LinkedIn URL', () => {
      const post = createPost({
        externalId: 'share123',
        id: 'post-123',
        platform: CredentialPlatform.LINKEDIN,
      });

      expect(post.postUrl).toBe(
        'https://linkedin.com/feed/update/urn:li:share:share123',
      );
    });
  });

  describe('platformUrl', () => {
    describe('YouTube', () => {
      it('should return YouTube studio URL for PUBLIC status', () => {
        const post = createPost({
          externalId: 'video123',
          id: 'post-123',
          platform: CredentialPlatform.YOUTUBE,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe(
          'https://studio.youtube.com/video/video123',
        );
      });

      it('should return YouTube studio URL for UNLISTED status', () => {
        const post = createPost({
          externalId: 'video123',
          id: 'post-123',
          platform: CredentialPlatform.YOUTUBE,
          status: PostStatus.UNLISTED,
        });

        expect(post.platformUrl).toBe(
          'https://studio.youtube.com/video/video123',
        );
      });

      it('should return YouTube studio URL for PRIVATE status', () => {
        const post = createPost({
          externalId: 'video123',
          id: 'post-123',
          platform: CredentialPlatform.YOUTUBE,
          status: PostStatus.PRIVATE,
        });

        expect(post.platformUrl).toBe(
          'https://studio.youtube.com/video/video123',
        );
      });

      it('should return null for DRAFT YouTube video', () => {
        const post = createPost({
          externalId: 'video123',
          id: 'post-123',
          platform: CredentialPlatform.YOUTUBE,
          status: PostStatus.DRAFT,
        });

        expect(post.platformUrl).toBeNull();
      });

      it('should return url if set for YouTube', () => {
        const post = createPost({
          id: 'post-123',
          platform: CredentialPlatform.YOUTUBE,
          status: PostStatus.PUBLIC,
          url: 'https://custom.url',
        });

        expect(post.platformUrl).toBe('https://custom.url');
      });

      it('should return null for YouTube without externalId', () => {
        const post = createPost({
          id: 'post-123',
          platform: CredentialPlatform.YOUTUBE,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBeNull();
      });
    });

    describe('other platforms', () => {
      it('should return null for non-PUBLIC status', () => {
        const post = createPost({
          externalId: 'tweet123',
          id: 'post-123',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.DRAFT,
        });

        expect(post.platformUrl).toBeNull();
      });

      it('should return url if set', () => {
        const post = createPost({
          id: 'post-123',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.PUBLIC,
          url: 'https://custom.url',
        });

        expect(post.platformUrl).toBe('https://custom.url');
      });

      it('should return null without externalId', () => {
        const post = createPost({
          id: 'post-123',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBeNull();
      });

      it('should build TikTok URL for PUBLIC', () => {
        const post = createPost({
          credential: createCredential({ externalHandle: 'user123' }),
          externalId: 'video123',
          id: 'post-123',
          platform: CredentialPlatform.TIKTOK,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe(
          'https://tiktok.com/@user123/video/video123',
        );
      });

      it('should build Instagram URL for PUBLIC', () => {
        const post = createPost({
          externalId: 'id123',
          externalShortcode: 'ABC',
          id: 'post-123',
          platform: CredentialPlatform.INSTAGRAM,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe('https://instagram.com/p/ABC');
      });

      it('should return null for Instagram without shortcode or id', () => {
        const post = createPost({
          externalId: '',
          externalShortcode: '',
          id: 'post-123',
          platform: CredentialPlatform.INSTAGRAM,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBeNull();
      });

      it('should build Twitter URL with username for PUBLIC', () => {
        const post = createPost({
          credential: createCredential({ externalHandle: 'user123' }),
          externalId: 'tweet123',
          id: 'post-123',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe('https://x.com/user123/status/tweet123');
      });

      it('should build Twitter fallback URL without username for PUBLIC', () => {
        const post = createPost({
          externalId: 'tweet123',
          id: 'post-123',
          platform: CredentialPlatform.TWITTER,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe('https://x.com/i/status/tweet123');
      });

      it('should build LinkedIn URL for PUBLIC', () => {
        const post = createPost({
          externalId: 'share123',
          id: 'post-123',
          platform: CredentialPlatform.LINKEDIN,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe(
          'https://linkedin.com/feed/update/urn:li:share:share123',
        );
      });

      it('should build Facebook URL for PUBLIC', () => {
        const post = createPost({
          externalId: 'fb123',
          id: 'post-123',
          platform: CredentialPlatform.FACEBOOK,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBe('https://www.facebook.com/fb123');
      });

      it('should return null for unknown platform', () => {
        const post = new Post({
          externalId: 'id123',
          id: 'post-123',
          platform: 'UNKNOWN' as CredentialPlatform,
          status: PostStatus.PUBLIC,
        });

        expect(post.platformUrl).toBeNull();
      });
    });
  });
});
