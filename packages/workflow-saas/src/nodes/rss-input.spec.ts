import { describe, expect, it } from 'vitest';
import { defaultRssInputData, rssInputNodeDefinition } from './rss-input';

describe('rss-input node', () => {
  describe('defaultRssInputData', () => {
    it('should have label set to RSS Input', () => {
      expect(defaultRssInputData.label).toBe('RSS Input');
    });

    it('should default to idle status', () => {
      expect(defaultRssInputData.status).toBe('idle');
    });

    it('should default inputMode to url', () => {
      expect(defaultRssInputData.inputMode).toBe('url');
    });

    it('should default feedUrl and rawXml to empty string', () => {
      expect(defaultRssInputData.feedUrl).toBe('');
      expect(defaultRssInputData.rawXml).toBe('');
    });

    it('should default selectedItemIndex to 0', () => {
      expect(defaultRssInputData.selectedItemIndex).toBe(0);
    });

    it('should default feedTitle and feedItems to null', () => {
      expect(defaultRssInputData.feedTitle).toBeNull();
      expect(defaultRssInputData.feedItems).toBeNull();
    });
  });

  describe('rssInputNodeDefinition', () => {
    it('should have type rssInput', () => {
      expect(rssInputNodeDefinition.type).toBe('rssInput');
    });

    it('should be in input category', () => {
      expect(rssInputNodeDefinition.category).toBe('input');
    });

    it('should have label RSS Input', () => {
      expect(rssInputNodeDefinition.label).toBe('RSS Input');
    });

    it('should have no inputs', () => {
      expect(rssInputNodeDefinition.inputs).toEqual([]);
    });

    it('should output title, description, and link', () => {
      const outputIds = rssInputNodeDefinition.outputs.map((o) => o.id);
      expect(outputIds).toEqual(['title', 'description', 'link']);
    });

    it('should reference default data', () => {
      expect(rssInputNodeDefinition.defaultData).toBe(defaultRssInputData);
    });
  });
});
