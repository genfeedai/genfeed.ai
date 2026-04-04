import type {
  IIngredient,
  IOrganization,
  IOrganizationSetting,
  IPrompt,
  ISetting,
  IUser,
} from '@genfeedai/interfaces';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Prompt: class BasePrompt {
    public enhanced?: string;
    public original?: string;
    public ingredient?: unknown;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    public id?: string;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Prompt } from '@models/content/prompt.model';

type PromptFixtureInput = Partial<IPrompt> & {
  description?: string;
  label?: string;
  profileId?: string;
  useRAG?: boolean;
};

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

const createIngredient = (partial: Partial<IIngredient> = {}): IIngredient => ({
  ...createBaseEntity<IIngredient>(partial),
  category: IngredientCategory.IMAGE,
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

const createPrompt = (partial: PromptFixtureInput = {}) =>
  new Prompt({
    ...createBaseEntity<IPrompt>(partial),
    category: IngredientCategory.IMAGE,
    enhanced: 'Enhanced text',
    hasVoted: false,
    isSkipEnhancement: false,
    isVoteAnimating: false,
    original: 'Original text',
    status: 'ready',
    totalVotes: 0,
    user: 'user_123',
    ...partial,
  });

describe('Prompt', () => {
  describe('constructor', () => {
    it('should create a prompt instance', () => {
      const prompt = createPrompt({
        enhanced: 'Enhanced text',
        original: 'Original text',
      });
      expect(prompt.enhanced).toBe('Enhanced text');
      expect(prompt.original).toBe('Original text');
    });

    it('should set extended properties', () => {
      const prompt = createPrompt({
        description: 'A test prompt',
        label: 'Test',
        profileId: 'profile-123',
        useRAG: true,
      });
      expect(prompt.label).toBe('Test');
      expect(prompt.description).toBe('A test prompt');
      expect(prompt.profileId).toBe('profile-123');
      expect(prompt.useRAG).toBe(true);
    });

    it('should instantiate populated ingredient', () => {
      const prompt = createPrompt({
        ingredient: createIngredient({ id: 'ing-123' }),
      });
      expect(prompt.ingredient).toBeDefined();
    });

    it('should not instantiate ingredient when it is a string', () => {
      const prompt = createPrompt({
        ingredient: 'ing-string' as never,
      });
      expect(prompt.ingredient).toBeDefined();
    });

    it('should handle missing extended properties', () => {
      const prompt = createPrompt({});
      expect(prompt.label).toBeUndefined();
      expect(prompt.description).toBeUndefined();
      expect(prompt.profileId).toBeUndefined();
      expect(prompt.useRAG).toBeUndefined();
    });
  });

  describe('promptText', () => {
    it('should return enhanced text when available', () => {
      const prompt = createPrompt({
        enhanced: 'Enhanced version',
        original: 'Original version',
      });
      expect(prompt.promptText).toBe('Enhanced version');
    });

    it('should fall back to original when enhanced is not set', () => {
      const prompt = createPrompt({
        enhanced: undefined,
        original: 'Original only',
      });
      expect(prompt.promptText).toBe('Original only');
    });

    it('should return undefined when neither enhanced nor original is set', () => {
      const prompt = createPrompt({
        enhanced: undefined,
        original: undefined,
      });
      expect(prompt.promptText).toBeUndefined();
    });

    it('should return enhanced even when it is empty string', () => {
      const prompt = createPrompt({
        enhanced: '',
        original: 'Has original',
      });
      expect(prompt.promptText).toBe('Has original');
    });
  });
});
