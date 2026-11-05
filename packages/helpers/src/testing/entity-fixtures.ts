import { AssetScope } from '@genfeedai/contracts';
import type {
  IBrand,
  IOrganization,
  IOrganizationSetting,
  ISetting,
  IUser,
} from '@genfeedai/contracts/interfaces';

/**
 * Complete, type-checked entity fixtures for specs.
 *
 * Each builder returns every required field of its contract, so a spec can
 * pass the result anywhere the real entity goes and override only what it
 * asserts on: `createBrand({ label: 'Acme' })`.
 */

/** The id and timestamps every persisted entity carries. */
export const createBaseEntity = <T extends { id: string }>(
  partial: Partial<T> = {},
): {
  createdAt: string;
  id: string;
  isDeleted: boolean;
  updatedAt: string;
} => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id: partial.id ?? 'entity-1',
  isDeleted: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** A user's settings with every notification and mode switched off. */
export const createSetting = (partial: Partial<ISetting> = {}): ISetting => ({
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

/** A complete user with default settings. */
export const createUser = (partial: Partial<IUser> = {}): IUser => ({
  ...createBaseEntity<IUser>(partial),
  email: 'test@example.com',
  firstName: 'Test',
  handle: 'test-user',
  lastName: 'User',
  settings: createSetting(),
  ...partial,
});

/** Organization settings with generation on and every add-on off. */
export const createOrganizationSetting = (
  partial: Partial<IOrganizationSetting> = {},
): IOrganizationSetting => ({
  ...createBaseEntity<IOrganizationSetting>(partial),
  brandsLimit: 1,
  isAutoEvaluateEnabled: false,
  isFleetNsfwVisible: false,
  isGenerateArticlesEnabled: true,
  isGenerateImagesEnabled: true,
  isGenerateMusicEnabled: true,
  isGenerateVideosEnabled: true,
  isNotificationsDiscordEnabled: false,
  isNotificationsTelegramEnabled: false,
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

/** A complete organization owned by a default user. */
export const createOrganization = (
  partial: Partial<IOrganization> = {},
): IOrganization => ({
  ...createBaseEntity<IOrganization>(partial),
  isSelected: false,
  label: 'Test Organization',
  settings: createOrganizationSetting(),
  user: createUser(),
  ...partial,
});

/** A complete brand inside a default organization. */
export const createBrand = (partial: Partial<IBrand> = {}): IBrand => ({
  ...createBaseEntity<IBrand>(partial),
  backgroundColor: '#000000',
  credentials: [],
  description: 'Brand description',
  fontFamily: 'Inter',
  isActive: true,
  isFleetEnabled: false,
  isDefault: false,
  isVerified: false,
  label: 'Test Brand',
  links: [],
  organization: createOrganization(),
  primaryColor: '#ffffff',
  scope: AssetScope.BRAND,
  secondaryColor: '#cccccc',
  slug: 'test-brand',
  user: createUser(),
  ...partial,
});
