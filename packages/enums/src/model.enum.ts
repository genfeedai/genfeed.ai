export enum ModelProvider {
  REPLICATE = 'replicate',
  FAL = 'fal',
  HUGGINGFACE = 'huggingface',
  GENFEED_AI = 'genfeed-ai',
}

export enum ModelCategory {
  TEXT = 'text',
  EMBEDDING = 'embedding',
  IMAGE = 'image',
  IMAGE_EDIT = 'image-edit',
  IMAGE_UPSCALE = 'image-upscale',
  VIDEO = 'video',
  VIDEO_EDIT = 'video-edit',
  VIDEO_UPSCALE = 'video-upscale',
  MUSIC = 'music',
  VOICE = 'voice',
}

export enum QualityTier {
  BASIC = 'basic',
  STANDARD = 'standard',
  HIGH = 'high',
  ULTRA = 'ultra',
}

export enum CostTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum SpeedTier {
  FAST = 'fast',
  MEDIUM = 'medium',
  SLOW = 'slow',
}

export enum PricingType {
  FLAT = 'flat',
  PER_MEGAPIXEL = 'per-megapixel',
  PER_SECOND = 'per-second',
}
