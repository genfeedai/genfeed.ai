/**
 * Prompt category. Values match Prisma `PromptCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum PromptCategory`
 */
export enum PromptCategory {
  BRAND_DESCRIPTION = 'BRAND_DESCRIPTION',
  STORYBOARD_SCRIPT_DESCRIPTION = 'STORYBOARD_SCRIPT_DESCRIPTION',
  PRESET_DESCRIPTION_TEXT = 'PRESET_DESCRIPTION_TEXT',
  PRESET_DESCRIPTION_IMAGE = 'PRESET_DESCRIPTION_IMAGE',
  PRESET_DESCRIPTION_VIDEO = 'PRESET_DESCRIPTION_VIDEO',
  PRESET_DESCRIPTION_MUSIC = 'PRESET_DESCRIPTION_MUSIC',
  POST_CONTENT_TWITTER = 'POST_CONTENT_TWITTER',
  POST_CONTENT_YOUTUBE = 'POST_CONTENT_YOUTUBE',
  POST_CONTENT_TIKTOK = 'POST_CONTENT_TIKTOK',
  POST_CONTENT_INSTAGRAM = 'POST_CONTENT_INSTAGRAM',
  POST_TITLE_TWITTER = 'POST_TITLE_TWITTER',
  POST_TITLE_YOUTUBE = 'POST_TITLE_YOUTUBE',
  POST_TITLE_TIKTOK = 'POST_TITLE_TIKTOK',
  POST_TITLE_INSTAGRAM = 'POST_TITLE_INSTAGRAM',
  MODELS_PROMPT_IMAGE = 'MODELS_PROMPT_IMAGE',
  MODELS_PROMPT_VIDEO = 'MODELS_PROMPT_VIDEO',
  MODELS_PROMPT_MUSIC = 'MODELS_PROMPT_MUSIC',
  MODELS_PROMPT_TRAINING = 'MODELS_PROMPT_TRAINING',
  ARTICLE = 'ARTICLE',
}

/**
 * Prompt lifecycle. Values match Prisma `PromptStatus`.
 * @see packages/prisma/prisma/schema.prisma `enum PromptStatus`
 */
export enum PromptStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  GENERATED = 'GENERATED',
  FAILED = 'FAILED',
}

export enum PromptTemplateCategory {
  ARTICLE_GENERATION = 'article-generation',
  ARTICLE_VIRALITY_ANALYSIS = 'article-virality-analysis',
  VIDEO_GENERATION = 'video-generation',
  VIDEO_CINEMATIC = 'video-cinematic',
  VIDEO_SOCIAL_MEDIA = 'video-social-media',
  VIDEO_PRODUCT_AD = 'video-product-ad',
  VIDEO_PODCAST = 'video-podcast',
  VIDEO_INFLUENCER = 'video-influencer',
  IMAGE_GENERATION = 'image-generation',
  IMAGE_PRODUCT_AD = 'image-product-ad',
  IMAGE_BANNER = 'image-banner',
  IMAGE_SUPER_MODEL = 'image-super-model',
  MUSIC_GENERATION = 'music-generation',
  CAPTION_GENERATION = 'caption-generation',
}
