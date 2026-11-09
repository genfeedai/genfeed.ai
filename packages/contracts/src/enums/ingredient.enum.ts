export { Scope as AssetScope } from './scope.enum';

import { defineStateMachine } from './state-machine.util';

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
 * Ingredient lifecycle (#9735), in two layers:
 *
 * - Generation: an ingredient is created DRAFT, PROCESSING, UPLOADED or
 *   GENERATED. PROCESSING settles as GENERATED, UPLOADED or FAILED; every
 *   settling writer compares PROCESSING in its `where`, so a late provider
 *   webhook never overwrites a cancelled (FAILED) generation. A FAILED
 *   ingredient goes back to PROCESSING only to retry, or when a late success
 *   arrives for a generation the stuck-ingredient cron timed out.
 * - Curation: the library validates, rejects or archives usable media, and
 *   archives failed media.
 *
 * `PATCH /ingredients` does not compare the current status yet, so it can
 * write any edge; this table is what the product intends.
 */
export const INGREDIENT_STATE_MACHINE = defineStateMachine<IngredientStatus>({
  terminal: [
    IngredientStatus.UPLOADED,
    IngredientStatus.GENERATED,
    IngredientStatus.VALIDATED,
    IngredientStatus.FAILED,
    IngredientStatus.ARCHIVED,
    IngredientStatus.REJECTED,
  ],
  transitions: {
    [IngredientStatus.DRAFT]: [
      IngredientStatus.PROCESSING,
      IngredientStatus.UPLOADED,
      IngredientStatus.GENERATED,
      IngredientStatus.FAILED,
    ],
    [IngredientStatus.PROCESSING]: [
      IngredientStatus.UPLOADED,
      IngredientStatus.GENERATED,
      IngredientStatus.FAILED,
    ],
    [IngredientStatus.UPLOADED]: [
      IngredientStatus.VALIDATED,
      IngredientStatus.REJECTED,
      IngredientStatus.ARCHIVED,
    ],
    [IngredientStatus.GENERATED]: [
      IngredientStatus.VALIDATED,
      IngredientStatus.REJECTED,
      IngredientStatus.ARCHIVED,
    ],
    [IngredientStatus.VALIDATED]: [
      IngredientStatus.REJECTED,
      IngredientStatus.ARCHIVED,
    ],
    [IngredientStatus.FAILED]: [
      IngredientStatus.PROCESSING,
      IngredientStatus.ARCHIVED,
    ],
    [IngredientStatus.ARCHIVED]: [],
    [IngredientStatus.REJECTED]: [
      IngredientStatus.VALIDATED,
      IngredientStatus.ARCHIVED,
    ],
  },
});

/** Generation has not settled: no media to use yet. */
export const INGREDIENT_GENERATION_ACTIVE_STATUSES: readonly IngredientStatus[] =
  INGREDIENT_STATE_MACHINE.states.filter(
    (status) => !INGREDIENT_STATE_MACHINE.isTerminal(status),
  );

/** Media is present and final, so other features may use it. */
export const INGREDIENT_READY_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
];

/** Settled without usable media: failed, rejected or archived. */
export const INGREDIENT_UNUSABLE_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.FAILED,
  IngredientStatus.ARCHIVED,
  IngredientStatus.REJECTED,
];

/** Generation settled, whether or not it produced usable media. */
export const INGREDIENT_GENERATION_SETTLED_STATUSES: readonly IngredientStatus[] =
  [...INGREDIENT_READY_STATUSES, ...INGREDIENT_UNUSABLE_STATUSES];

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
