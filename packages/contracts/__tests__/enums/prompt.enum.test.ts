import { describe, expect, it } from 'vitest';
import {
  PromptCategory,
  PromptStatus,
  PromptTemplateCategory,
} from '../../src/enums/prompt.enum';

describe('prompt.enum', () => {
  describe('PromptCategory', () => {
    it('should have 19 members', () => {
      expect(Object.values(PromptCategory)).toHaveLength(19);
    });

    it('should have correct values', () => {
      expect(PromptCategory.BRAND_DESCRIPTION).toBe('BRAND_DESCRIPTION');
      expect(PromptCategory.STORYBOARD_SCRIPT_DESCRIPTION).toBe(
        'STORYBOARD_SCRIPT_DESCRIPTION',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_TEXT).toBe(
        'PRESET_DESCRIPTION_TEXT',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_IMAGE).toBe(
        'PRESET_DESCRIPTION_IMAGE',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_VIDEO).toBe(
        'PRESET_DESCRIPTION_VIDEO',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_MUSIC).toBe(
        'PRESET_DESCRIPTION_MUSIC',
      );
      expect(PromptCategory.POST_CONTENT_TWITTER).toBe('POST_CONTENT_TWITTER');
      expect(PromptCategory.POST_CONTENT_YOUTUBE).toBe('POST_CONTENT_YOUTUBE');
      expect(PromptCategory.POST_CONTENT_TIKTOK).toBe('POST_CONTENT_TIKTOK');
      expect(PromptCategory.POST_CONTENT_INSTAGRAM).toBe(
        'POST_CONTENT_INSTAGRAM',
      );
      expect(PromptCategory.POST_TITLE_TWITTER).toBe('POST_TITLE_TWITTER');
      expect(PromptCategory.POST_TITLE_YOUTUBE).toBe('POST_TITLE_YOUTUBE');
      expect(PromptCategory.POST_TITLE_TIKTOK).toBe('POST_TITLE_TIKTOK');
      expect(PromptCategory.POST_TITLE_INSTAGRAM).toBe('POST_TITLE_INSTAGRAM');
      expect(PromptCategory.MODELS_PROMPT_IMAGE).toBe('MODELS_PROMPT_IMAGE');
      expect(PromptCategory.MODELS_PROMPT_VIDEO).toBe('MODELS_PROMPT_VIDEO');
      expect(PromptCategory.MODELS_PROMPT_MUSIC).toBe('MODELS_PROMPT_MUSIC');
      expect(PromptCategory.MODELS_PROMPT_TRAINING).toBe(
        'MODELS_PROMPT_TRAINING',
      );
      expect(PromptCategory.ARTICLE).toBe('ARTICLE');
    });
  });

  describe('PromptStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(PromptStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(PromptStatus.DRAFT).toBe('DRAFT');
      expect(PromptStatus.PROCESSING).toBe('PROCESSING');
      expect(PromptStatus.GENERATED).toBe('GENERATED');
      expect(PromptStatus.FAILED).toBe('FAILED');
    });
  });

  describe('PromptTemplateCategory', () => {
    it('should have 14 members', () => {
      expect(Object.values(PromptTemplateCategory)).toHaveLength(14);
    });

    it('should have correct values', () => {
      expect(PromptTemplateCategory.ARTICLE_GENERATION).toBe(
        'article-generation',
      );
      expect(PromptTemplateCategory.ARTICLE_VIRALITY_ANALYSIS).toBe(
        'article-virality-analysis',
      );
      expect(PromptTemplateCategory.VIDEO_GENERATION).toBe('video-generation');
      expect(PromptTemplateCategory.VIDEO_CINEMATIC).toBe('video-cinematic');
      expect(PromptTemplateCategory.VIDEO_SOCIAL_MEDIA).toBe(
        'video-social-media',
      );
      expect(PromptTemplateCategory.VIDEO_PRODUCT_AD).toBe('video-product-ad');
      expect(PromptTemplateCategory.VIDEO_PODCAST).toBe('video-podcast');
      expect(PromptTemplateCategory.VIDEO_INFLUENCER).toBe('video-influencer');
      expect(PromptTemplateCategory.IMAGE_GENERATION).toBe('image-generation');
      expect(PromptTemplateCategory.IMAGE_PRODUCT_AD).toBe('image-product-ad');
      expect(PromptTemplateCategory.IMAGE_BANNER).toBe('image-banner');
      expect(PromptTemplateCategory.IMAGE_SUPER_MODEL).toBe(
        'image-super-model',
      );
      expect(PromptTemplateCategory.MUSIC_GENERATION).toBe('music-generation');
      expect(PromptTemplateCategory.CAPTION_GENERATION).toBe(
        'caption-generation',
      );
    });
  });
});
