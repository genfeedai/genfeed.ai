export { Scope as AssetScope } from './scope.enum';

/**
 * Ingredient media category. Values match Prisma `IngredientCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum IngredientCategory`
 */
export enum IngredientCategory {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  MUSIC = 'MUSIC',
  GIF = 'GIF',
  AVATAR = 'AVATAR',
  AUDIO = 'AUDIO',
  IMAGE_EDIT = 'IMAGE_EDIT',
  VIDEO_EDIT = 'VIDEO_EDIT',
  VOICE = 'VOICE',
  INGREDIENT = 'INGREDIENT',
  TEXT = 'TEXT',
  SOURCE = 'SOURCE',
}

/**
 * Ingredient lifecycle. Values match Prisma `IngredientStatus` (SCREAMING_SNAKE).
 * @see packages/prisma/prisma/schema.prisma `enum IngredientStatus`
 */
export enum IngredientStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  UPLOADED = 'UPLOADED',
  GENERATED = 'GENERATED',
  VALIDATED = 'VALIDATED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
}

/**
 * Automated quality verdict for an ingredient. Values match Prisma
 * `QualityStatus` exactly.
 *
 * `ingredients.qualityStatus` is a Postgres enum column (`@default(UNRATED)`),
 * written by `ContentQualityScorerService`. Distinct from that service's
 * `category` label (`excellent` / `good` / `needs_work` / `poor`), which is a
 * presentation-only vocabulary with no column behind it.
 *
 * @see packages/prisma/prisma/schema.prisma `enum QualityStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const QualityStatus = {
  UNRATED: 'UNRATED',
  GOOD: 'GOOD',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
} as const;

export type QualityStatus = (typeof QualityStatus)[keyof typeof QualityStatus];

/**
 * Transformation category. Values match Prisma `TransformationCategory`,
 * which backs the `ingredients.transformations` array column — so these
 * labels are load-bearing, not decorative. Keep SCREAMING.
 * @see packages/prisma/prisma/schema.prisma `enum TransformationCategory`
 */
export enum TransformationCategory {
  UPSCALED = 'UPSCALED',
  RESIZED = 'RESIZED',
  ENHANCED = 'ENHANCED',
  EXTENDED = 'EXTENDED',
  INTERPOLATED = 'INTERPOLATED',
  STABILIZED = 'STABILIZED',
  BACKGROUND_REMOVED = 'BACKGROUND_REMOVED',
  STYLE_TRANSFERRED = 'STYLE_TRANSFERRED',
  FACE_SWAPPED = 'FACE_SWAPPED',
  LIP_SYNCED = 'LIP_SYNCED',
  ANIMATED = 'ANIMATED',
  IMAGE_TO_VIDEO = 'IMAGE_TO_VIDEO',
  CLIPPED = 'CLIPPED',
  MERGED = 'MERGED',
  EDITED = 'EDITED',
  REVERSED = 'REVERSED',
  MIRRORED = 'MIRRORED',
  CAPTIONED = 'CAPTIONED',
  VALIDATED = 'VALIDATED',
  REFRAMED = 'REFRAMED',
}

export enum IngredientExtension {
  JPG = 'jpg',
  MP3 = 'mp3',
  MP4 = 'mp4',
  MOV = 'mov',
  GIF = 'gif',
}

export enum IngredientFormat {
  LANDSCAPE = 'landscape',
  PORTRAIT = 'portrait',
  SQUARE = 'square',
}

export enum IngredientAvatarCategory {
  AVATAR = 'avatar',
  AVATAR_VIDEO = 'avatar-video',
}

/**
 * Fleet review lifecycle. Values match Prisma `FleetReviewStatus`.
 * @see packages/prisma/prisma/schema.prisma `enum FleetReviewStatus`
 */
export enum FleetReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_REVISION = 'NEEDS_REVISION',
}

/**
 * Fleet asset label. Values match Prisma `FleetAssetLabel`.
 * @see packages/prisma/prisma/schema.prisma `enum FleetAssetLabel`
 */
export enum FleetAssetLabel {
  HERO = 'HERO',
  FILLER = 'FILLER',
  BTS = 'BTS',
  PROMO = 'PROMO',
  LIFESTYLE = 'LIFESTYLE',
  EDITORIAL = 'EDITORIAL',
}

/**
 * Content rating. Values match Prisma `ContentRating`.
 * @see packages/prisma/prisma/schema.prisma `enum ContentRating`
 */
export enum ContentRating {
  SFW = 'SFW',
  SUGGESTIVE = 'SUGGESTIVE',
  NSFW = 'NSFW',
}
