import { describe, expect, it } from 'vitest';
import { AiActionType } from '../src/ai-action.enum';

describe('ai-action.enum', () => {
  describe('AiActionType', () => {
    it('should have 14 members', () => {
      expect(Object.values(AiActionType)).toHaveLength(14);
    });

    it('should have correct values', () => {
      expect(AiActionType.ENHANCE_PROMPT).toBe('enhance-prompt');
      expect(AiActionType.REWRITE).toBe('rewrite');
      expect(AiActionType.SHORTEN).toBe('shorten');
      expect(AiActionType.EXPAND).toBe('expand');
      expect(AiActionType.TONE_ADJUST).toBe('tone-adjust');
      expect(AiActionType.SEO_OPTIMIZE).toBe('seo-optimize');
      expect(AiActionType.ADD_HASHTAGS).toBe('add-hashtags');
      expect(AiActionType.HOOK_GENERATOR).toBe('hook-generator');
      expect(AiActionType.ADAPT_PLATFORM).toBe('adapt-platform');
      expect(AiActionType.GRAMMAR_CHECK).toBe('grammar-check');
      expect(AiActionType.EXPLAIN_METRIC).toBe('explain-metric');
      expect(AiActionType.SUGGEST_KEYWORDS).toBe('suggest-keywords');
      expect(AiActionType.CONTENT_SUGGEST).toBe('content-suggest');
      expect(AiActionType.ANALYTICS_INSIGHT).toBe('analytics-insight');
    });
  });
});
