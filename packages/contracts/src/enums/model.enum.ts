export enum ModelProvider {
  REPLICATE = 'replicate',
  FAL = 'fal',
  CRUN = 'crun',
  OPENROUTER = 'openrouter',
  GENFEED_AI = 'genfeed-ai',
  /** Direct integration (no fal/Replicate intermediary) — e.g. Mureka V9. */
  MUREKA = 'mureka',
  /** Direct integration — HeyGen photo-avatar video (`heygen/avatar`). */
  HEYGEN = 'heygen',
  /** Direct integration — Higgsfield Soul, DoP, and Genjutsu. */
  HIGGSFIELD = 'higgsfield',
}

/**
 * Operator-controlled model availability. Persisted values intentionally match
 * the Prisma enum exactly; UI labels title-case these values at the boundary.
 */
export enum ModelLifecycle {
  RECOMMENDED = 'RECOMMENDED',
  AVAILABLE = 'AVAILABLE',
  LEGACY = 'LEGACY',
  RETIRED = 'RETIRED',
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
  PER_REQUEST = 'per-request',
  PER_SECOND = 'per-second',
}
