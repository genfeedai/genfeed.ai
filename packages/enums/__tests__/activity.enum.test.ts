import { describe, expect, it } from 'vitest';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ActivityStatus,
} from '../src/activity.enum';

describe('activity.enum', () => {
  describe('ActivitySource', () => {
    it('should have 33 members', () => {
      expect(Object.values(ActivitySource)).toHaveLength(33);
    });

    it('should have correct values', () => {
      expect(ActivitySource.SCRIPT).toBe('system');
      expect(ActivitySource.SUPERADMIN).toBe('admin');
      expect(ActivitySource.SUBSCRIPTION).toBe('credits-subscription');
      expect(ActivitySource.PAY_AS_YOU_GO).toBe('credits-payg');
      expect(ActivitySource.VIDEO_GENERATION).toBe('video-generate');
      expect(ActivitySource.IMAGE_GENERATION).toBe('image-generate');
      expect(ActivitySource.MUSIC_GENERATION).toBe('music-generate');
      expect(ActivitySource.ARTICLE_GENERATION).toBe('article-generate');
      expect(ActivitySource.AVATAR_GENERATION).toBe('avatar-generate');
      expect(ActivitySource.ASSET_GENERATION).toBe('asset-generate');
      expect(ActivitySource.VIDEO_REFRAME).toBe('video-transform-reframe');
      expect(ActivitySource.VIDEO_UPSCALE).toBe('video-transform-upscale');
      expect(ActivitySource.IMAGE_REFRAME).toBe('image-transform-reframe');
      expect(ActivitySource.IMAGE_UPSCALE).toBe('image-transform-upscale');
      expect(ActivitySource.PROMPT_CREATION).toBe('prompt-create');
      expect(ActivitySource.PROMPT_ENHANCEMENT).toBe('prompt-enhance');
      expect(ActivitySource.PROMPT_REMIX).toBe('prompt-generate-remix');
      expect(ActivitySource.ARTICLE_ENHANCEMENT).toBe('article-enhance');
      expect(ActivitySource.ARTICLE_REMIX).toBe('article-remix');
      expect(ActivitySource.ARTICLE_VIRALITY_ANALYSIS).toBe(
        'article-analyze-virality',
      );
      expect(ActivitySource.ARTICLE_PROMPT_GENERATION).toBe(
        'article-generate-prompt',
      );
      expect(ActivitySource.POST_ENHANCEMENT).toBe('post-enhance');
      expect(ActivitySource.IMAGE_EVALUATION).toBe('image-evaluate');
      expect(ActivitySource.VIDEO_EVALUATION).toBe('video-evaluate');
      expect(ActivitySource.ARTICLE_EVALUATION).toBe('article-evaluate');
      expect(ActivitySource.CONTENT_EVALUATION).toBe('content-evaluate');
      expect(ActivitySource.MODELS_TRAINING).toBe('model-train');
      expect(ActivitySource.POST).toBe('content-publish');
      expect(ActivitySource.POST_GENERATION).toBe('post-generate');
      expect(ActivitySource.TWEET_REPLY).toBe('tweet-generate-reply');
      expect(ActivitySource.SOCIAL_INTEGRATION).toBe('integration-social');
      expect(ActivitySource.WEB).toBe('web');
      expect(ActivitySource.BOT_GENERATION).toBe('bot-generate');
    });
  });

  describe('ActivityKey', () => {
    it('should have 47 members', () => {
      expect(Object.values(ActivityKey)).toHaveLength(47);
    });

    it('should have correct values', () => {
      expect(ActivityKey.CREDITS_ADD).toBe('credits-add');
      expect(ActivityKey.CREDITS_REMOVE).toBe('credits-remove');
      expect(ActivityKey.CREDITS_REMOVE_ALL).toBe('credits-remove-all');
      expect(ActivityKey.CREDITS_RESET).toBe('credits-reset');
      expect(ActivityKey.IMAGE_PROCESSING).toBe('image-processing');
      expect(ActivityKey.IMAGE_GENERATED).toBe('image-generated');
      expect(ActivityKey.IMAGE_FAILED).toBe('image-failed');
      expect(ActivityKey.VIDEO_PROCESSING).toBe('video-processing');
      expect(ActivityKey.VIDEO_GENERATED).toBe('video-generated');
      expect(ActivityKey.VIDEO_COMPLETED).toBe('video-completed');
      expect(ActivityKey.VIDEO_FAILED).toBe('video-failed');
      expect(ActivityKey.VIDEO_SCHEDULED).toBe('video-scheduled');
      expect(ActivityKey.MUSIC_PROCESSING).toBe('music-processing');
      expect(ActivityKey.MUSIC_GENERATED).toBe('music-generated');
      expect(ActivityKey.MUSIC_FAILED).toBe('music-failed');
      expect(ActivityKey.MODELS_TRAINING_CREATED).toBe(
        'model-training-created',
      );
      expect(ActivityKey.MODELS_TRAINING_FAILED).toBe('model-training-failed');
      expect(ActivityKey.MODELS_TRAINING_COMPLETED).toBe(
        'model-training-completed',
      );
      expect(ActivityKey.SOCIAL_INTEGRATION_FAILED).toBe(
        'integration-social-failed',
      );
      expect(ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED).toBe(
        'integration-social-disconnected',
      );
      expect(ActivityKey.POST_PROCESSING).toBe('post-processing');
      expect(ActivityKey.POST_GENERATED).toBe('post-generated');
      expect(ActivityKey.POST_FAILED).toBe('content-publish-failed');
      expect(ActivityKey.POST_SCHEDULED).toBe('content-publish-scheduled');
      expect(ActivityKey.POST_PUBLISHED).toBe('content-publish-published');
      expect(ActivityKey.POST_CREATED).toBe('content-created');
      expect(ActivityKey.ARTICLE_PROCESSING).toBe('article-processing');
      expect(ActivityKey.ARTICLE_GENERATED).toBe('article-generated');
      expect(ActivityKey.ARTICLE_FAILED).toBe('article-failed');
      expect(ActivityKey.VIDEO_REFRAME_PROCESSING).toBe(
        'video-reframe-processing',
      );
      expect(ActivityKey.VIDEO_REFRAME_COMPLETED).toBe(
        'video-reframe-completed',
      );
      expect(ActivityKey.VIDEO_REFRAME_FAILED).toBe('video-reframe-failed');
      expect(ActivityKey.VIDEO_UPSCALE_PROCESSING).toBe(
        'video-upscale-processing',
      );
      expect(ActivityKey.VIDEO_UPSCALE_COMPLETED).toBe(
        'video-upscale-completed',
      );
      expect(ActivityKey.VIDEO_UPSCALE_FAILED).toBe('video-upscale-failed');
      expect(ActivityKey.IMAGE_REFRAME_PROCESSING).toBe(
        'image-reframe-processing',
      );
      expect(ActivityKey.IMAGE_REFRAME_COMPLETED).toBe(
        'image-reframe-completed',
      );
      expect(ActivityKey.IMAGE_REFRAME_FAILED).toBe('image-reframe-failed');
      expect(ActivityKey.IMAGE_UPSCALE_PROCESSING).toBe(
        'image-upscale-processing',
      );
      expect(ActivityKey.IMAGE_UPSCALE_COMPLETED).toBe(
        'image-upscale-completed',
      );
      expect(ActivityKey.IMAGE_UPSCALE_FAILED).toBe('image-upscale-failed');
      expect(ActivityKey.PROMPT_ENHANCE_PROCESSING).toBe(
        'prompt-enhance-processing',
      );
      expect(ActivityKey.PROMPT_ENHANCE_COMPLETED).toBe(
        'prompt-enhance-completed',
      );
      expect(ActivityKey.PROMPT_ENHANCE_FAILED).toBe('prompt-enhance-failed');
      expect(ActivityKey.PROMPT_REMIX_PROCESSING).toBe(
        'prompt-remix-processing',
      );
      expect(ActivityKey.PROMPT_REMIX_COMPLETED).toBe('prompt-remix-completed');
      expect(ActivityKey.PROMPT_REMIX_FAILED).toBe('prompt-remix-failed');
    });
  });

  describe('ActivityStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(ActivityStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ActivityStatus.PROCESSING).toBe('processing');
      expect(ActivityStatus.COMPLETED).toBe('completed');
      expect(ActivityStatus.FAILED).toBe('failed');
    });
  });

  describe('ActivityEntityModel', () => {
    it('should have 3 members', () => {
      expect(Object.values(ActivityEntityModel)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ActivityEntityModel.INGREDIENT).toBe('Ingredient');
      expect(ActivityEntityModel.POST).toBe('Post');
      expect(ActivityEntityModel.ARTICLE).toBe('Article');
    });
  });
});
