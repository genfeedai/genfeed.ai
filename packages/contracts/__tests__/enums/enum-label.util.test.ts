import { describe, expect, it } from 'vitest';
import { AgentStrategyRunStatus } from '../../src/enums/agent-strategy.enum';
import { ArticleStatus } from '../../src/enums/article.enum';
import { BatchStatus } from '../../src/enums/batch.enum';
import { BotStatus } from '../../src/enums/bot.enum';
import { CampaignTargetStatus } from '../../src/enums/campaign.enum';
import { formatEnumLabel, toEnumSlug } from '../../src/enums/enum-label.util';
import {
  IngredientCategory,
  IngredientStatus,
} from '../../src/enums/ingredient.enum';
import { PromptCategory, PromptStatus } from '../../src/enums/prompt.enum';
import { SubscriptionStatus } from '../../src/enums/subscription.enum';
import { WorkflowExecutionStatus } from '../../src/enums/workflow.enum';

/**
 * Every SCREAMING_SNAKE enum this repo renders through `formatEnumLabel`.
 * A new member that reads badly as a label fails here, not in production.
 */
const RENDERED_SCREAMING_ENUMS: Readonly<Record<string, object>> = {
  AgentStrategyRunStatus,
  ArticleStatus,
  BatchStatus,
  BotStatus,
  CampaignTargetStatus,
  IngredientCategory,
  IngredientStatus,
  PromptCategory,
  PromptStatus,
  SubscriptionStatus,
  WorkflowExecutionStatus,
};

describe('enum-label.util', () => {
  describe('formatEnumLabel', () => {
    it('title-cases single-segment SCREAMING_SNAKE values', () => {
      expect(formatEnumLabel(IngredientCategory.IMAGE)).toBe('Image');
      expect(formatEnumLabel(IngredientCategory.VIDEO)).toBe('Video');
      expect(formatEnumLabel(IngredientStatus.PROCESSING)).toBe('Processing');
    });

    it('splits multi-segment values into spaced words', () => {
      expect(formatEnumLabel(IngredientCategory.IMAGE_EDIT)).toBe('Image Edit');
      expect(formatEnumLabel(IngredientCategory.VIDEO_EDIT)).toBe('Video Edit');
      expect(formatEnumLabel('NEEDS_REVIEW')).toBe('Needs Review');
    });

    it('keeps known acronyms uppercase', () => {
      expect(formatEnumLabel(IngredientCategory.GIF)).toBe('GIF');
      expect(formatEnumLabel('NSFW')).toBe('NSFW');
      expect(formatEnumLabel('SFW')).toBe('SFW');
      expect(formatEnumLabel('AI_GENERATED')).toBe('AI Generated');
    });

    it('normalizes kebab, spaced, and mixed-case input', () => {
      expect(formatEnumLabel('image-edit')).toBe('Image Edit');
      expect(formatEnumLabel('  image   edit  ')).toBe('Image Edit');
      expect(formatEnumLabel('ImAgE_eDiT')).toBe('Image Edit');
    });

    it('returns null for non-string and empty input', () => {
      expect(formatEnumLabel(null)).toBeNull();
      expect(formatEnumLabel(undefined)).toBeNull();
      expect(formatEnumLabel('')).toBeNull();
      expect(formatEnumLabel('   ')).toBeNull();
      expect(formatEnumLabel('___')).toBeNull();
      expect(formatEnumLabel(42)).toBeNull();
    });

    it('never leaks a raw underscore into a rendered label', () => {
      for (const category of Object.values(IngredientCategory)) {
        expect(formatEnumLabel(category)).not.toContain('_');
      }

      for (const status of Object.values(IngredientStatus)) {
        expect(formatEnumLabel(status)).not.toContain('_');
      }
    });

    it.each(Object.entries(RENDERED_SCREAMING_ENUMS))(
      'renders every %s member as product language',
      (_name, members) => {
        for (const value of Object.values(members)) {
          const label = formatEnumLabel(value);

          expect(label).not.toBeNull();
          expect(label).not.toContain('_');
          // Every label is either a deliberately preserved acronym (GIF) or
          // title-cased prose. A label with no lowercase letter and no acronym
          // spelling means the raw SCREAMING value leaked to the screen.
          const isAcronymLabel = /^[A-Z]{2,5}$/.test(label ?? '');
          expect(isAcronymLabel || /[a-z]/.test(label ?? '')).toBe(true);
        }
      },
    );
  });

  describe('toEnumSlug', () => {
    it('lowercases and hyphenates enum values', () => {
      expect(toEnumSlug(IngredientCategory.IMAGE)).toBe('image');
      expect(toEnumSlug(IngredientCategory.IMAGE_EDIT)).toBe('image-edit');
      expect(toEnumSlug(IngredientCategory.VIDEO_EDIT)).toBe('video-edit');
      expect(toEnumSlug(IngredientStatus.ARCHIVED)).toBe('archived');
    });

    it('is idempotent on already-slugged input', () => {
      expect(toEnumSlug('image-edit')).toBe('image-edit');
    });

    it('returns null for non-string and empty input', () => {
      expect(toEnumSlug(null)).toBeNull();
      expect(toEnumSlug(undefined)).toBeNull();
      expect(toEnumSlug('')).toBeNull();
      expect(toEnumSlug('  ')).toBeNull();
      expect(toEnumSlug(42)).toBeNull();
    });

    it('never leaks uppercase or underscores into a slug', () => {
      for (const category of Object.values(IngredientCategory)) {
        const slug = toEnumSlug(category);
        expect(slug).toBe(slug?.toLowerCase());
        expect(slug).not.toContain('_');
      }
    });
  });
});
