import { describe, expect, it } from 'vitest';
import {
  ContentTemplateKey,
  PromptTemplateKey,
  SystemPromptKey,
  TemplateCategory,
  TemplateDifficulty,
  TemplateIndustry,
  TemplatePlatform,
  TemplateSortBy,
  VariableType,
} from '../src/template.enum';

describe('template.enum', () => {
  describe('TemplateCategory', () => {
    it('should have 30 members', () => {
      expect(Object.values(TemplateCategory)).toHaveLength(30);
    });

    it('should have correct values', () => {
      expect(TemplateCategory.CAPTION).toBe('caption');
      expect(TemplateCategory.VIDEO).toBe('video');
      expect(TemplateCategory.IMAGE).toBe('image');
      expect(TemplateCategory.ARTICLE).toBe('article');
      expect(TemplateCategory.SCRIPT).toBe('script');
      expect(TemplateCategory.EMAIL).toBe('email');
      expect(TemplateCategory.SOCIAL_MEDIA).toBe('social-media');
      expect(TemplateCategory.MARKETING).toBe('marketing');
      expect(TemplateCategory.ECOMMERCE).toBe('ecommerce');
      expect(TemplateCategory.EDUCATION).toBe('education');
      expect(TemplateCategory.ENTERTAINMENT).toBe('entertainment');
      expect(TemplateCategory.NEWS).toBe('news');
      expect(TemplateCategory.PERSONAL_BRAND).toBe('personal-brand');
      expect(TemplateCategory.CORPORATE).toBe('corporate');
      expect(TemplateCategory.NONPROFIT).toBe('nonprofit');
      expect(TemplateCategory.ARTICLE_GENERATION).toBe('article-generation');
      expect(TemplateCategory.ARTICLE_EDIT).toBe('article-edit');
      expect(TemplateCategory.ARTICLE_VIRALITY_ANALYSIS).toBe(
        'article-virality-analysis',
      );
      expect(TemplateCategory.VIDEO_GENERATION).toBe('video-generation');
      expect(TemplateCategory.VIDEO_CINEMATIC).toBe('video-cinematic');
      expect(TemplateCategory.VIDEO_SOCIAL_MEDIA).toBe('video-social-media');
      expect(TemplateCategory.VIDEO_PRODUCT_AD).toBe('video-product-ad');
      expect(TemplateCategory.VIDEO_PODCAST).toBe('video-podcast');
      expect(TemplateCategory.VIDEO_INFLUENCER).toBe('video-influencer');
      expect(TemplateCategory.IMAGE_GENERATION).toBe('image-generation');
      expect(TemplateCategory.IMAGE_PRODUCT_AD).toBe('image-product-ad');
      expect(TemplateCategory.IMAGE_BANNER).toBe('image-banner');
      expect(TemplateCategory.IMAGE_SUPER_MODEL).toBe('image-super-model');
      expect(TemplateCategory.MUSIC_GENERATION).toBe('music-generation');
      expect(TemplateCategory.CAPTION_GENERATION).toBe('caption-generation');
    });
  });

  describe('TemplateDifficulty', () => {
    it('should have 3 members', () => {
      expect(Object.values(TemplateDifficulty)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(TemplateDifficulty.BEGINNER).toBe('beginner');
      expect(TemplateDifficulty.INTERMEDIATE).toBe('intermediate');
      expect(TemplateDifficulty.ADVANCED).toBe('advanced');
    });
  });

  describe('TemplateIndustry', () => {
    it('should have 11 members', () => {
      expect(Object.values(TemplateIndustry)).toHaveLength(11);
    });

    it('should have correct values', () => {
      expect(TemplateIndustry.TECHNOLOGY).toBe('technology');
      expect(TemplateIndustry.FINANCE).toBe('finance');
      expect(TemplateIndustry.HEALTHCARE).toBe('healthcare');
      expect(TemplateIndustry.RETAIL).toBe('retail');
      expect(TemplateIndustry.FOOD).toBe('food');
      expect(TemplateIndustry.FASHION).toBe('fashion');
      expect(TemplateIndustry.TRAVEL).toBe('travel');
      expect(TemplateIndustry.FITNESS).toBe('fitness');
      expect(TemplateIndustry.REAL_ESTATE).toBe('real-estate');
      expect(TemplateIndustry.AUTOMOTIVE).toBe('automotive');
      expect(TemplateIndustry.GENERAL).toBe('general');
    });
  });

  describe('TemplateSortBy', () => {
    it('should have 5 members', () => {
      expect(Object.values(TemplateSortBy)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(TemplateSortBy.POPULAR).toBe('popular');
      expect(TemplateSortBy.RECENT).toBe('recent');
      expect(TemplateSortBy.RATING).toBe('rating');
      expect(TemplateSortBy.USAGE).toBe('usage');
      expect(TemplateSortBy.NAME).toBe('name');
    });
  });

  describe('VariableType', () => {
    it('should have 10 members', () => {
      expect(Object.values(VariableType)).toHaveLength(10);
    });

    it('should have correct values', () => {
      expect(VariableType.TEXT).toBe('text');
      expect(VariableType.NUMBER).toBe('number');
      expect(VariableType.BOOLEAN).toBe('boolean');
      expect(VariableType.SELECT).toBe('select');
      expect(VariableType.MULTISELECT).toBe('multiselect');
      expect(VariableType.COLOR).toBe('color');
      expect(VariableType.IMAGE).toBe('image');
      expect(VariableType.VIDEO).toBe('video');
      expect(VariableType.DATE).toBe('date');
      expect(VariableType.URL).toBe('url');
    });
  });

  describe('SystemPromptKey', () => {
    it('should have 40 members', () => {
      expect(Object.values(SystemPromptKey)).toHaveLength(40);
    });

    it('should have correct values', () => {
      expect(SystemPromptKey.DEFAULT).toBe('system.default');
      expect(SystemPromptKey.IMAGE).toBe('system.image');
      expect(SystemPromptKey.VIDEO).toBe('system.video');
      expect(SystemPromptKey.MUSIC).toBe('system.music');
      expect(SystemPromptKey.ARTICLE).toBe('system.article');
      expect(SystemPromptKey.EVALUATION).toBe('system.evaluation');
      expect(SystemPromptKey.ENHANCEMENT).toBe('system.enhancement');
      expect(SystemPromptKey.VIRALITY).toBe('system.virality');
      expect(SystemPromptKey.TWEET).toBe('system.tweet');
      expect(SystemPromptKey.TWEET_REPLY).toBe('system.tweet-reply');
      expect(SystemPromptKey.IMAGE_PROMPT).toBe('system.image-prompt');
      expect(SystemPromptKey.TWITTER).toBe('system.twitter');
      expect(SystemPromptKey.TWITTER_CONTENT).toBe('system.twitter.content');
      expect(SystemPromptKey.TWITTER_TITLE).toBe('system.twitter.title');
      expect(SystemPromptKey.YOUTUBE).toBe('system.youtube');
      expect(SystemPromptKey.YOUTUBE_CONTENT).toBe('system.youtube.content');
      expect(SystemPromptKey.YOUTUBE_TITLE).toBe('system.youtube.title');
      expect(SystemPromptKey.INSTAGRAM).toBe('system.instagram');
      expect(SystemPromptKey.INSTAGRAM_CONTENT).toBe(
        'system.instagram.content',
      );
      expect(SystemPromptKey.INSTAGRAM_TITLE).toBe('system.instagram.title');
      expect(SystemPromptKey.LINKEDIN).toBe('system.linkedin');
      expect(SystemPromptKey.LINKEDIN_CONTENT).toBe('system.linkedin.content');
      expect(SystemPromptKey.LINKEDIN_TITLE).toBe('system.linkedin.title');
      expect(SystemPromptKey.TIKTOK).toBe('system.tiktok');
      expect(SystemPromptKey.TIKTOK_CONTENT).toBe('system.tiktok.content');
      expect(SystemPromptKey.TIKTOK_TITLE).toBe('system.tiktok.title');
      expect(SystemPromptKey.BRAND).toBe('system.brand');
      expect(SystemPromptKey.BRAND_CONTEXT).toBe('system.brand-context');
      expect(SystemPromptKey.BRAND_DESCRIPTION).toBe(
        'system.brand-description',
      );
      expect(SystemPromptKey.MODEL_IMAGE).toBe('system.model.image');
      expect(SystemPromptKey.MODEL_VIDEO).toBe('system.model.video');
      expect(SystemPromptKey.MODEL_MUSIC).toBe('system.model.music');
      expect(SystemPromptKey.MODEL_TRAINING).toBe('system.model.training');
      expect(SystemPromptKey.PRESET_TEXT).toBe('system.preset.text');
      expect(SystemPromptKey.PRESET_IMAGE).toBe('system.preset.image');
      expect(SystemPromptKey.PRESET_VIDEO).toBe('system.preset.video');
      expect(SystemPromptKey.PRESET_MUSIC).toBe('system.preset.music');
      expect(SystemPromptKey.STORYBOARD_SCRIPT).toBe(
        'system.storyboard.script',
      );
      expect(SystemPromptKey.X_ARTICLE).toBe('system.x-article');
      expect(SystemPromptKey.HOOK_GENERATOR).toBe('system.hook-generator');
    });
  });

  describe('PromptTemplateKey', () => {
    it('should have 26 members', () => {
      expect(Object.values(PromptTemplateKey)).toHaveLength(26);
    });

    it('should have correct values', () => {
      expect(PromptTemplateKey.TEXT_DEFAULT).toBe('prompt.text.default');
      expect(PromptTemplateKey.TEXT_ENHANCEMENT).toBe(
        'prompt.text.enhancement',
      );
      expect(PromptTemplateKey.TEXT_ARTICLE).toBe('prompt.text.article');
      expect(PromptTemplateKey.TEXT_TWEET).toBe('prompt.text.tweet');
      expect(PromptTemplateKey.TEXT_TWEET_REPLY).toBe(
        'prompt.text.tweet-reply',
      );
      expect(PromptTemplateKey.TEXT_IMAGE_PROMPT).toBe(
        'prompt.text.image-prompt',
      );
      expect(PromptTemplateKey.TEXT_VIRALITY).toBe('prompt.text.virality');
      expect(PromptTemplateKey.EVALUATION_VIDEO).toBe(
        'prompt.evaluation.video',
      );
      expect(PromptTemplateKey.EVALUATION_IMAGE).toBe(
        'prompt.evaluation.image',
      );
      expect(PromptTemplateKey.EVALUATION_ARTICLE).toBe(
        'prompt.evaluation.article',
      );
      expect(PromptTemplateKey.EVALUATION_POST).toBe('prompt.evaluation.post');
      expect(PromptTemplateKey.ARTICLE_GENERATE).toBe(
        'prompt.article.generate',
      );
      expect(PromptTemplateKey.ARTICLE_EDIT).toBe('prompt.article.edit');
      expect(PromptTemplateKey.ARTICLE_SEO).toBe('prompt.article.seo');
      expect(PromptTemplateKey.ARTICLE_VIRALITY).toBe(
        'prompt.article.virality',
      );
      expect(PromptTemplateKey.ARTICLE_TRANSCRIPT).toBe(
        'prompt.article.transcript',
      );
      expect(PromptTemplateKey.ARTICLE_IMAGE_PROMPT).toBe(
        'prompt.article.image-prompt',
      );
      expect(PromptTemplateKey.TWEET_GENERATION).toBe(
        'prompt.tweet.generation',
      );
      expect(PromptTemplateKey.THREAD_GENERATION).toBe(
        'prompt.thread.generation',
      );
      expect(PromptTemplateKey.THREAD_EXPAND).toBe('prompt.thread.expand');
      expect(PromptTemplateKey.TWEET_REPLY).toBe('prompt.tweet.reply');
      expect(PromptTemplateKey.POST_ENHANCEMENT).toBe(
        'prompt.post.enhancement',
      );
      expect(PromptTemplateKey.REMIX).toBe('prompt.remix');
      expect(PromptTemplateKey.ENHANCEMENT).toBe('prompt.enhancement');
      expect(PromptTemplateKey.X_ARTICLE_GENERATE).toBe(
        'prompt.x-article.generate',
      );
      expect(PromptTemplateKey.HOOK_VARIATIONS).toBe('prompt.hook.variations');
    });
  });

  describe('ContentTemplateKey', () => {
    it('should have 13 members', () => {
      expect(Object.values(ContentTemplateKey)).toHaveLength(13);
    });

    it('should have correct values', () => {
      expect(ContentTemplateKey.VIDEO_DEFAULT).toBe('content.video.default');
      expect(ContentTemplateKey.VIDEO_CINEMATIC).toBe(
        'content.video.cinematic',
      );
      expect(ContentTemplateKey.VIDEO_SOCIAL).toBe('content.video.social');
      expect(ContentTemplateKey.VIDEO_PRODUCT).toBe('content.video.product');
      expect(ContentTemplateKey.VIDEO_PODCAST).toBe('content.video.podcast');
      expect(ContentTemplateKey.VIDEO_INFLUENCER).toBe(
        'content.video.influencer',
      );
      expect(ContentTemplateKey.IMAGE_DEFAULT).toBe('content.image.default');
      expect(ContentTemplateKey.IMAGE_PRODUCT).toBe('content.image.product');
      expect(ContentTemplateKey.IMAGE_BANNER).toBe('content.image.banner');
      expect(ContentTemplateKey.IMAGE_SUPER_MODEL).toBe(
        'content.image.super-model',
      );
      expect(ContentTemplateKey.IMAGE_SOCIAL_ILLUSTRATION).toBe(
        'content.image.social-illustration',
      );
      expect(ContentTemplateKey.IMAGE_LOGO).toBe('content.image.logo');
      expect(ContentTemplateKey.MUSIC_DEFAULT).toBe('content.music.default');
    });
  });

  describe('TemplatePlatform (aliased export)', () => {
    it('should be defined and have enum values', () => {
      expect(TemplatePlatform).toBeDefined();
      expect(Object.keys(TemplatePlatform).length).toBeGreaterThan(0);
    });
  });
});
