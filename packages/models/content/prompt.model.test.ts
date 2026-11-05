import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient, IPrompt } from '@genfeedai/contracts/interfaces';
import {
  createBaseEntity,
  createOrganization,
  createUser,
} from '@genfeedai/helpers/testing/entity-fixtures';
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

import { Ingredient } from '@models/content/ingredient.model';
import { Prompt } from '@models/content/prompt.model';

type PromptFixtureInput = Partial<IPrompt> & {
  description?: string;
  label?: string;
  profileId?: string;
  useRAG?: boolean;
};

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
    userId: 'user_123',
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

    it('should instantiate populated ingredients', () => {
      const prompt = createPrompt({
        ingredients: [createIngredient({ id: 'ing-123' })],
      });
      expect(prompt.ingredients).toHaveLength(1);
      expect(prompt.ingredients?.[0]).toBeInstanceOf(Ingredient);
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
