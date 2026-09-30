import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYWORD_TRIGGER_DATA } from './keyword-trigger';

describe('keyword-trigger node', () => {
  describe('DEFAULT_KEYWORD_TRIGGER_DATA', () => {
    it('should have label set to Keyword Trigger', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.label).toBe('Keyword Trigger');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.status).toBe('idle');
    });

    it('should have type set to keywordTrigger', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.type).toBe('keywordTrigger');
    });

    it('should default platform to twitter', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.platform).toBe('twitter');
    });

    it('should default matchMode to contains', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.matchMode).toBe('contains');
    });

    it('should default caseSensitive to false', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.caseSensitive).toBe(false);
    });

    it('should default keywords and excludeKeywords to empty arrays', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.keywords).toEqual([]);
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.excludeKeywords).toEqual([]);
    });

    it('should default tracking fields to null', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.lastPostId).toBeNull();
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.lastTriggeredAt).toBeNull();
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.lastMatchedKeyword).toBeNull();
    });
  });
});
