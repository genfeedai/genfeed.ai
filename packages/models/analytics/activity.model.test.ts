import { ActivityKey } from '@genfeedai/enums';
import type { IActivity, ISetting, IUser } from '@genfeedai/interfaces';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Activity: class BaseActivity {
    public key?: string;
    public value?: string;
    public user?: unknown;
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

import { Activity } from '@models/analytics/activity.model';

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

const createActivity = (partial: Partial<IActivity> = {}) =>
  new Activity({
    ...createBaseEntity<IActivity>(partial),
    isRead: false,
    key: ActivityKey.VIDEO_PROCESSING,
    source: 'test',
    user: createUser(),
    value: 'value',
    ...partial,
  });

describe('Activity', () => {
  describe('constructor', () => {
    it('should create an activity instance', () => {
      const activity = createActivity({
        key: ActivityKey.VIDEO_PROCESSING,
        value: 'vid-123',
      });
      expect(activity.key).toBe(ActivityKey.VIDEO_PROCESSING);
      expect(activity.value).toBe('vid-123');
    });

    it('should instantiate populated user object', () => {
      const activity = createActivity({
        user: createUser({ id: 'user-1' }),
      });
      expect(activity.user).toBeDefined();
      expect((activity.user as { id: string }).id).toBe('user-1');
    });

    it('should not wrap user when it is a string', () => {
      const activity = createActivity({
        user: 'user-string' as never,
      });
      expect(activity.user).toBe('user-string');
    });
  });

  describe('label', () => {
    it('should return processing label for VIDEO_PROCESSING', () => {
      const activity = createActivity({
        key: ActivityKey.VIDEO_PROCESSING,
        value: 'my-video',
      });
      expect(activity.label).toBe('Video my-video started to be processed');
    });

    it('should return generated label for VIDEO_COMPLETED', () => {
      const activity = createActivity({
        key: ActivityKey.VIDEO_COMPLETED,
        value: 'my-video',
      });
      expect(activity.label).toBe('Video my-video generated');
    });

    it('should return generated label for VIDEO_GENERATED', () => {
      const activity = createActivity({
        key: ActivityKey.VIDEO_GENERATED,
        value: 'my-video',
      });
      expect(activity.label).toBe('Video my-video generated');
    });

    it('should return processing label for IMAGE_PROCESSING', () => {
      const activity = createActivity({
        key: ActivityKey.IMAGE_PROCESSING,
        value: 'img-456',
      });
      expect(activity.label).toBe('Image img-456 Processing');
    });

    it('should return credits add label for CREDITS_ADD', () => {
      const activity = createActivity({
        key: ActivityKey.CREDITS_ADD,
        value: '1000',
      });
      expect(activity.label).toContain('$GENFEED added');
      expect(activity.label).toContain('1,000');
    });

    it('should return credits remove label for CREDITS_REMOVE', () => {
      const activity = createActivity({
        key: ActivityKey.CREDITS_REMOVE,
        value: '500',
      });
      expect(activity.label).toContain('$GENFEED removed');
    });

    it('should return key as fallback for unknown activity keys', () => {
      const activity = createActivity({
        key: 'UNKNOWN_KEY',
        value: 'test',
      });
      expect(activity.label).toBe('UNKNOWN_KEY');
    });
  });
});
