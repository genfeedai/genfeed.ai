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

export enum IngredientStatus {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  UPLOADED = 'uploaded',
  GENERATED = 'generated',
  VALIDATED = 'validated',
  FAILED = 'failed',
  ARCHIVED = 'archived',
  REJECTED = 'rejected',
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

export enum DarkroomReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  NEEDS_REVISION = 'needs-revision',
}

export enum DarkroomAssetLabel {
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
