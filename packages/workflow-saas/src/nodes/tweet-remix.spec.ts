import { describe, expect, it } from 'vitest';
import { defaultTweetRemixData, tweetRemixNodeDefinition } from './tweet-remix';

describe('tweet-remix node', () => {
  describe('defaultTweetRemixData', () => {
    it('should have label set to Tweet Remix', () => {
      expect(defaultTweetRemixData.label).toBe('Tweet Remix');
    });

    it('should default to idle status', () => {
      expect(defaultTweetRemixData.status).toBe('idle');
    });

    it('should default tone to professional', () => {
      expect(defaultTweetRemixData.tone).toBe('professional');
    });

    it('should default maxLength to 280 (Twitter character limit)', () => {
      expect(defaultTweetRemixData.maxLength).toBe(280);
    });

    it('should default variations to empty array', () => {
      expect(defaultTweetRemixData.variations).toEqual([]);
    });

    it('should default nullable fields to null', () => {
      expect(defaultTweetRemixData.inputTweet).toBeNull();
      expect(defaultTweetRemixData.selectedIndex).toBeNull();
      expect(defaultTweetRemixData.outputTweet).toBeNull();
      expect(defaultTweetRemixData.jobId).toBeNull();
    });
  });

  describe('tweetRemixNodeDefinition', () => {
    it('should have type tweetRemix', () => {
      expect(tweetRemixNodeDefinition.type).toBe('tweetRemix');
    });

    it('should be in ai category', () => {
      expect(tweetRemixNodeDefinition.category).toBe('ai');
    });

    it('should have label Tweet Remix', () => {
      expect(tweetRemixNodeDefinition.label).toBe('Tweet Remix');
    });

    it('should require text input', () => {
      expect(tweetRemixNodeDefinition.inputs).toHaveLength(1);
      expect(tweetRemixNodeDefinition.inputs[0].id).toBe('text');
      expect(tweetRemixNodeDefinition.inputs[0].required).toBe(true);
    });

    it('should output selected tweet text', () => {
      expect(tweetRemixNodeDefinition.outputs).toHaveLength(1);
      expect(tweetRemixNodeDefinition.outputs[0].id).toBe('text');
      expect(tweetRemixNodeDefinition.outputs[0].type).toBe('text');
    });

    it('should reference default data', () => {
      expect(tweetRemixNodeDefinition.defaultData).toBe(defaultTweetRemixData);
    });
  });
});
