import { ActivityKey } from '@genfeedai/contracts';
import type {
  IActivity,
  ISetting,
  IUser,
} from '@genfeedai/contracts/interfaces';
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
  isVideoNotificationsEmail: false,
  isVerified: false,
  theme: 'light',
  trendNotificationsFrequency: 'DAILY',
  trendNotificationsMinViralScore: 0,
  ...partial,
});

const createUser = (partial: Partial<IUser> = {}): IUser => ({
  ...createBaseEntity<IUser>(partial),
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
    it('formats media lifecycle keys from the catalog', () => {
      expect(
        createActivity({
          key: ActivityKey.VIDEO_PROCESSING,
          value: 'my-video',
        }).label,
      ).toBe('Generating a video...');
      expect(
        createActivity({
          key: ActivityKey.VIDEO_GENERATED,
          value: 'my-video',
        }).label,
      ).toBe('Generated a video');
      expect(
        createActivity({
          key: ActivityKey.IMAGE_PROCESSING,
          value: '{"ingredientId":"x"}',
        }).label,
      ).toBe('Generating an image...');
      expect(
        createActivity({
          key: ActivityKey.IMAGE_FAILED,
          value: 'boom',
        }).label,
      ).toBe('Failed to generate image');
    });

    it('formats credit amounts without $GENFEED or raw keys', () => {
      expect(
        createActivity({
          key: ActivityKey.CREDITS_ADD,
          value: '1000',
        }).label,
      ).toBe('1,000 credits added');
      expect(
        createActivity({
          key: ActivityKey.CREDITS_REMOVE,
          value: '8',
        }).label,
      ).toBe('8 credits used');
    });

    it('never returns the raw wire key for unknown activity keys', () => {
      const activity = createActivity({
        key: 'unknown-widget-failed',
        value: 'test',
      });
      expect(activity.label).not.toBe('unknown-widget-failed');
      expect(activity.label.length).toBeGreaterThan(0);
    });
  });
});
