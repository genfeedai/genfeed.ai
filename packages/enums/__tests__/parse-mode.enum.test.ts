import { describe, expect, it } from 'vitest';
import { ParseMode } from '../src/parse-mode.enum';

describe('parse-mode.enum', () => {
  describe('ParseMode', () => {
    it('should have 3 members', () => {
      expect(Object.values(ParseMode)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ParseMode.HTML).toBe('HTML');
      expect(ParseMode.MARKDOWN).toBe('Markdown');
      expect(ParseMode.MARKDOWN_V2).toBe('MarkdownV2');
    });
  });
});
