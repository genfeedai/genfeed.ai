import type {
  IBrand,
  IMember,
  IOrganization,
  IOrganizationSetting,
  IRole,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Member: class BaseMember {
    public organization?: unknown;
    public user?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      fullName?: string;
    };
    public role?: { label?: string };
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/role.model', () => ({
  Role: class Role {
    public label?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    public firstName?: string;
    public lastName?: string;
    public email?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
    get fullName(): string {
      const name = `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim();
      return name || '-';
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

import { Member } from '@models/organization/member.model';

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

const createRole = (partial: Partial<IRole> = {}): IRole => ({
  ...createBaseEntity<IRole>(partial),
  key: 'admin',
  label: 'Admin',
  ...partial,
});

const _createBrand = (partial: Partial<IBrand> = {}): IBrand => ({
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
  scope: 'brand' as never,
  secondaryColor: '#cccccc',
  user: createUser(),
  ...partial,
});

const createMember = (partial: Partial<IMember> = {}) =>
  new Member({
    ...createBaseEntity<IMember>(partial),
    isActive: true,
    organization: createOrganization(),
    role: createRole(),
    user: createUser(),
    ...partial,
  });

describe('Member', () => {
  describe('constructor', () => {
    it('should create a member instance', () => {
      const member = createMember({ id: 'mem-1' });
      expect(member).toBeDefined();
    });

    it('should instantiate populated organization', () => {
      const member = createMember({
        organization: createOrganization({ id: 'org-1' }),
      });
      expect(member.organization).toBeDefined();
    });

    it('should instantiate populated user', () => {
      const member = createMember({
        user: createUser({
          email: 'test@example.com',
          firstName: 'John',
          id: 'user-1',
        }),
      });
      expect(member.user).toBeDefined();
    });

    it('should instantiate populated role', () => {
      const member = createMember({
        role: createRole({ id: 'role-1', label: 'Admin' }),
      });
      expect(member.role).toBeDefined();
    });

    it('should not wrap organization when it is a string', () => {
      const member = createMember({
        organization: 'org-string',
      } as never);
      expect(member.organization).toBe('org-string');
    });
  });

  describe('userFullName', () => {
    it('should return full name from User instance', () => {
      const member = createMember({
        user: createUser({ firstName: 'Jane', id: 'u1', lastName: 'Doe' }),
      });
      expect(member.userFullName).toBe('Jane Doe');
    });

    it('should return "-" when user has no name', () => {
      const member = createMember({
        user: createUser({ firstName: '', id: 'u2', lastName: '' }),
      });
      expect(member.userFullName).toBe('-');
    });

    it('should return first name only when last name is missing', () => {
      const member = createMember({
        user: createUser({ firstName: 'Alice', id: 'u3', lastName: '' }),
      });
      expect(member.userFullName).toBe('Alice');
    });

    it('should handle user as non-User instance', () => {
      const member = createMember({ user: undefined as never });
      expect(member.userFullName).toBe('-');
    });
  });

  describe('userEmail', () => {
    it('should return user email', () => {
      const member = createMember({
        user: createUser({ email: 'test@example.com', id: 'u1' }),
      });
      expect(member.userEmail).toBe('test@example.com');
    });

    it('should return undefined when user is missing', () => {
      const member = createMember({ user: undefined as never });
      expect(member.userEmail).toBeUndefined();
    });
  });

  describe('roleLabel', () => {
    it('should return role label', () => {
      const member = createMember({
        role: createRole({ id: 'r1', key: 'editor', label: 'Editor' }),
      });
      expect(member.roleLabel).toBe('Editor');
    });

    it('should return undefined when role is missing', () => {
      const member = createMember({ role: undefined as never });
      expect(member.roleLabel).toBeUndefined();
    });
  });
});
