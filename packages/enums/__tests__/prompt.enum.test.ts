import { describe, expect, it } from 'vitest';
import {
  PromptCategory,
  PromptStatus,
  PromptTemplateCategory,
} from '../src/prompt.enum';

describe('prompt.enum', () => {
  describe('PromptCategory', () => {
    it('should have 19 members', () => {
      expect(Object.values(PromptCategory)).toHaveLength(19);
    });

    it('should have correct values', () => {
      expect(PromptCategory.BRAND_DESCRIPTION).toBe('brand-description');
      expect(PromptCategory.STORYBOARD_SCRIPT_DESCRIPTION).toBe(
        'storyboard-script-description',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_TEXT).toBe(
        'presets-description-text',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_IMAGE).toBe(
        'presets-description-image',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_VIDEO).toBe(
        'presets-description-video',
      );
      expect(PromptCategory.PRESET_DESCRIPTION_MUSIC).toBe(
        'presets-description-music',
      );
      expect(PromptCategory.POST_CONTENT_TWITTER).toBe('post-content-twitter');
      expect(PromptCategory.POST_CONTENT_YOUTUBE).toBe('post-content-youtube');
      expect(PromptCategory.POST_CONTENT_TIKTOK).toBe('post-content-tiktok');
      expect(PromptCategory.POST_CONTENT_INSTAGRAM).toBe(
        'post-content-instagram',
      );
      expect(PromptCategory.POST_TITLE_TWITTER).toBe('post-title-twitter');
      expect(PromptCategory.POST_TITLE_YOUTUBE).toBe('post-title-youtube');
      expect(PromptCategory.POST_TITLE_TIKTOK).toBe('post-title-tiktok');
      expect(PromptCategory.POST_TITLE_INSTAGRAM).toBe('post-title-instagram');
      expect(PromptCategory.MODELS_PROMPT_IMAGE).toBe('models-prompt-image');
      expect(PromptCategory.MODELS_PROMPT_VIDEO).toBe('models-prompt-video');
      expect(PromptCategory.MODELS_PROMPT_MUSIC).toBe('models-prompt-music');
      expect(PromptCategory.MODELS_PROMPT_TRAINING).toBe(
        'models-prompt-genfeedai',
      );
      expect(PromptCategory.ARTICLE).toBe('article');
    });
  });

  describe('PromptStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(PromptStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(PromptStatus.DRAFT).toBe('draft');
      expect(PromptStatus.PROCESSING).toBe('processing');
      expect(PromptStatus.GENERATED).toBe('generated');
      expect(PromptStatus.FAILED).toBe('failed');
    });
  });

  describe('PromptTemplateCategory', () => {
    it('should have 15 members', () => {
      expect(Object.values(PromptTemplateCategory)).toHaveLength(15);
    });

    it('should have correct values', () => {
      expect(PromptTemplateCategory.ARTICLE_GENERATION).toBe(
        'article-generation',
      );
      expect(PromptTemplateCategory.ARTICLE_EDIT).toBe('article-edit');
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
