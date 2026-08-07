export { Scope as AssetScope } from './scope.enum';

export enum IngredientCategory {
  IMAGE = 'image',
  VIDEO = 'video',
  MUSIC = 'music',
  GIF = 'gif',
  AVATAR = 'avatar',
  AUDIO = 'audio',
  IMAGE_EDIT = 'image-edit',
  VIDEO_EDIT = 'video-edit',
  VOICE = 'voice',
  INGREDIENT = 'ingredient',
  TEXT = 'text',
  SOURCE = 'source',
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

export enum TransformationCategory {
  UPSCALED = 'upscaled',
  RESIZED = 'resized',
  ENHANCED = 'enhanced',
  EXTENDED = 'extended',
  INTERPOLATED = 'interpolated',
  STABILIZED = 'stabilized',
  BACKGROUND_REMOVED = 'background-removed',
  STYLE_TRANSFERRED = 'style-transferred',
  FACE_SWAPPED = 'face-swapped',
  LIP_SYNCED = 'lip-synced',
  ANIMATED = 'animated',
  IMAGE_TO_VIDEO = 'image-to-video',
  CLIPPED = 'clipped',
  MERGED = 'merged',
  EDITED = 'edited',
  REVERSED = 'reversed',
  MIRRORED = 'mirrored',
  CAPTIONED = 'captioned',
  VALIDATED = 'validated',
  REFRAMED = 'reframed',
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

export enum FleetReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  NEEDS_REVISION = 'needs-revision',
}

export enum FleetAssetLabel {
  HERO = 'hero',
  FILLER = 'filler',
  BTS = 'bts',
  PROMO = 'promo',
  LIFESTYLE = 'lifestyle',
  EDITORIAL = 'editorial',
}

export enum ContentRating {
  SFW = 'sfw',
  SUGGESTIVE = 'suggestive',
  NSFW = 'nsfw',
}
