import { CredentialPlatform } from '@genfeedai/enums';
import type {
  ICredential,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  BaseCredential: class BaseCredential {
    public platform!: string;
    public externalHandle?: string;
    public user?: unknown;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  BaseCredentialInstagram: class BaseCredentialInstagram {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  BaseCredentialOAuth: class BaseCredentialOAuth {
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

import {
  Credential,
  CredentialInstagram,
  CredentialOAuth,
} from '@models/auth/credential.model';

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

const createCredential = (partial: Partial<ICredential> = {}) =>
  new Credential({
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

describe('Credential', () => {
  describe('constructor', () => {
    it('should create a credential instance', () => {
      const cred = createCredential({
        externalHandle: 'user123',
        platform: CredentialPlatform.TWITTER,
      });
      expect(cred.platform).toBe(CredentialPlatform.TWITTER);
      expect(cred.externalHandle).toBe('user123');
    });

    it('should instantiate populated user', () => {
      const cred = createCredential({
        user: createUser({ id: 'user-123' }),
      });
      expect(cred.user).toBeDefined();
      expect((cred.user as { id: string }).id).toBe('user-123');
    });

    it('should not instantiate user when it is a string', () => {
      const cred = createCredential({
        user: 'user-string-id' as never,
      });
      expect(cred.user).toBe('user-string-id');
    });
  });

  describe('externalUrl', () => {
    it('should return YouTube URL', () => {
      const cred = createCredential({
        externalHandle: 'channel123',
        platform: CredentialPlatform.YOUTUBE,
      });
      expect(cred.externalUrl).toBe('https://www.youtube.com/@channel123');
    });

    it('should return TikTok URL', () => {
      const cred = createCredential({
        externalHandle: 'tiktoker',
        platform: CredentialPlatform.TIKTOK,
      });
      expect(cred.externalUrl).toBe('https://www.tiktok.com/@tiktoker');
    });

    it('should return Twitter/X URL', () => {
      const cred = createCredential({
        externalHandle: 'tweeter',
        platform: CredentialPlatform.TWITTER,
      });
      expect(cred.externalUrl).toBe('https://x.com/tweeter');
    });

    it('should return Instagram URL', () => {
      const cred = createCredential({
        externalHandle: 'instagrammer',
        platform: CredentialPlatform.INSTAGRAM,
      });
      expect(cred.externalUrl).toBe('https://www.instagram.com/instagrammer');
    });

    it('should return LinkedIn URL', () => {
      const cred = createCredential({
        externalHandle: 'professional',
        platform: CredentialPlatform.LINKEDIN,
      });
      expect(cred.externalUrl).toBe('https://www.linkedin.com/in/professional');
    });

    it('should return empty string for unknown platform', () => {
      const cred = createCredential({
        externalHandle: 'handle',
        platform: 'UNKNOWN' as CredentialPlatform,
      });
      expect(cred.externalUrl).toBe('');
    });
  });
});

describe('CredentialInstagram', () => {
  it('should create an instance', () => {
    const inst = new CredentialInstagram({});
    expect(inst).toBeDefined();
  });
});

describe('CredentialOAuth', () => {
  it('should create an instance', () => {
    const oauth = new CredentialOAuth({});
    expect(oauth).toBeDefined();
  });
});
