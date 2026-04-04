import { describe, expect, it } from 'vitest';
import { defaultTweetInputData, tweetInputNodeDefinition } from './tweet-input';

describe('tweet-input node', () => {
  describe('defaultTweetInputData', () => {
    it('should have label set to Tweet Input', () => {
      expect(defaultTweetInputData.label).toBe('Tweet Input');
    });

    it('should default to idle status', () => {
      expect(defaultTweetInputData.status).toBe('idle');
    });

    it('should default inputMode to url', () => {
      expect(defaultTweetInputData.inputMode).toBe('url');
    });

    it('should default tweetUrl and rawText to empty string', () => {
      expect(defaultTweetInputData.tweetUrl).toBe('');
      expect(defaultTweetInputData.rawText).toBe('');
    });

    it('should default extractedTweet and authorHandle to null', () => {
      expect(defaultTweetInputData.extractedTweet).toBeNull();
      expect(defaultTweetInputData.authorHandle).toBeNull();
    });
  });

  describe('tweetInputNodeDefinition', () => {
    it('should have type tweetInput', () => {
      expect(tweetInputNodeDefinition.type).toBe('tweetInput');
    });

    it('should be in input category', () => {
      expect(tweetInputNodeDefinition.category).toBe('input');
    });

    it('should have label Tweet Input', () => {
      expect(tweetInputNodeDefinition.label).toBe('Tweet Input');
    });

    it('should have no inputs', () => {
      expect(tweetInputNodeDefinition.inputs).toEqual([]);
    });

    it('should output tweet text', () => {
      expect(tweetInputNodeDefinition.outputs).toHaveLength(1);
      expect(tweetInputNodeDefinition.outputs[0].id).toBe('text');
      expect(tweetInputNodeDefinition.outputs[0].type).toBe('text');
    });

    it('should reference default data', () => {
      expect(tweetInputNodeDefinition.defaultData).toBe(defaultTweetInputData);
    });
  });
});
