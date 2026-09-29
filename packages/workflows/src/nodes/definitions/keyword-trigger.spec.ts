import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYWORD_TRIGGER_DATA } from './keyword-trigger';

describe('keyword-trigger node', () => {
  describe('DEFAULT_KEYWORD_TRIGGER_DATA', () => {
    it('should default keywords and excludeKeywords to empty arrays', () => {
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.keywords).toEqual([]);
      expect(DEFAULT_KEYWORD_TRIGGER_DATA.excludeKeywords).toEqual([]);
    });
  });
});
