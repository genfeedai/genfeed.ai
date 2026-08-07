import { ContentFormat } from '@genfeedai/enums';

/**
 * Batch generation pricing — shared by agent UI estimates and server charge.
 *
 * Every batch item always incurs a **caption** LLM cost (scaled by model tier).
 * **Media** costs apply when the item's format needs media and media was (or
 * will be) produced. Format packaging reflects product intent even for
 * caption-first drafts.
 *
 * Chat model **round** cost is billed separately by the orchestrator.
 */

/** Base credits for one caption/text draft (before model multiplier). */
export const BATCH_CAPTION_BASE_CREDITS = 1;

/**
 * Planned media / packaging cost by content format.
 * Tweet-like text slots use image format with caption-only when no media.
 */
export const BATCH_FORMAT_MEDIA_CREDITS: Record<ContentFormat, number> = {
  [ContentFormat.IMAGE]: 8,
  [ContentFormat.VIDEO]: 45,
  [ContentFormat.REEL]: 40,
  [ContentFormat.CAROUSEL]: 18,
  [ContentFormat.STORY]: 6,
};

/** Default content mix when the client does not pass one (matches batch creation). */
export const DEFAULT_BATCH_CONTENT_MIX: Record<ContentFormat, number> = {
  [ContentFormat.IMAGE]: 60,
  [ContentFormat.VIDEO]: 25,
  [ContentFormat.CAROUSEL]: 10,
  [ContentFormat.REEL]: 5,
  [ContentFormat.STORY]: 0,
};

export type BatchPricingQualityTier =
  | 'budget'
  | 'balanced'
  | 'high_quality'
  | string
  | null
  | undefined;

/** Multiplier applied only to caption LLM cost. */
export function batchCaptionModelMultiplier(
  qualityTier?: BatchPricingQualityTier,
  chatModelRoundCredits?: number | null,
): number {
  if (
    typeof chatModelRoundCredits === 'number' &&
    Number.isFinite(chatModelRoundCredits) &&
    chatModelRoundCredits > 0
  ) {
    // Scale vs a mid-tier 4-credit round baseline.
    return Math.min(4, Math.max(0.75, chatModelRoundCredits / 4));
  }

  switch (qualityTier) {
    case 'budget':
      return 1;
    case 'high_quality':
      return 2.5;
    case 'balanced':
    default:
      return 1.5;
  }
}

export type BatchItemPricingInput = {
  format: ContentFormat | string;
  /** When true, include full media cost for the format. */
  hasMedia?: boolean;
};

export type BatchPricingOptions = {
  /** Chat model round credits (from registry) — scales caption cost. */
  chatModelRoundCredits?: number | null;
  /**
   * When true (default for estimates), charge media rates for non-text formats.
   * When false, only caption + a small format packaging fee is charged
   * (current pipeline: caption drafts only).
   */
  includeMedia?: boolean;
  qualityTier?: BatchPricingQualityTier;
};

/**
 * Format packaging when media is not yet generated (caption + draft row only).
 * Video/reel slots cost more than a still image even before media lands.
 */
const FORMAT_PACKAGING_WITHOUT_MEDIA: Record<ContentFormat, number> = {
  [ContentFormat.IMAGE]: 2,
  [ContentFormat.VIDEO]: 8,
  [ContentFormat.REEL]: 8,
  [ContentFormat.CAROUSEL]: 4,
  [ContentFormat.STORY]: 2,
};

function normalizeFormat(format: ContentFormat | string): ContentFormat {
  const value = String(format).toLowerCase() as ContentFormat;
  if (value in BATCH_FORMAT_MEDIA_CREDITS) {
    return value;
  }
  return ContentFormat.IMAGE;
}

/**
 * Credits for a single batch item.
 */
export function batchItemCredits(
  item: BatchItemPricingInput,
  options: BatchPricingOptions = {},
): number {
  const format = normalizeFormat(item.format);
  const caption = Math.ceil(
    BATCH_CAPTION_BASE_CREDITS *
      batchCaptionModelMultiplier(
        options.qualityTier,
        options.chatModelRoundCredits,
      ),
  );

  const includeMedia = options.includeMedia !== false;
  if (item.hasMedia || includeMedia) {
    return caption + (BATCH_FORMAT_MEDIA_CREDITS[format] ?? 0);
  }

  return caption + (FORMAT_PACKAGING_WITHOUT_MEDIA[format] ?? 0);
}

export type BatchEstimateInput = {
  contentMix?: Partial<Record<ContentFormat, number>> | null;
  count: number;
  platforms?: string[] | null;
  /** Per-platform multiplier is not used; reserved for future. */
};

/**
 * Estimate total tool credits for a batch before run.
 * Uses weighted content mix; does not include chat-round cost.
 */
export function estimateBatchGenerationCredits(
  input: BatchEstimateInput,
  options: BatchPricingOptions = {},
): number {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0) {
    return 0;
  }

  const mix = {
    ...DEFAULT_BATCH_CONTENT_MIX,
    ...(input.contentMix ?? {}),
  };

  const percentTotal =
    mix[ContentFormat.IMAGE] +
    mix[ContentFormat.VIDEO] +
    mix[ContentFormat.CAROUSEL] +
    mix[ContentFormat.REEL] +
    mix[ContentFormat.STORY];

  if (percentTotal <= 0) {
    return count * batchItemCredits({ format: ContentFormat.IMAGE }, options);
  }

  let total = 0;
  const formats = Object.values(ContentFormat);
  for (const format of formats) {
    const share = Math.max(0, mix[format] ?? 0) / percentTotal;
    const formatCount = Math.round(count * share);
    total +=
      formatCount * batchItemCredits({ format, hasMedia: false }, options);
  }

  // Rounding drift: ensure we price at least `count` items.
  const assigned = formats.reduce((sum, format) => {
    const share = Math.max(0, mix[format] ?? 0) / percentTotal;
    return sum + Math.round(count * share);
  }, 0);
  if (assigned < count) {
    total +=
      (count - assigned) *
      batchItemCredits({ format: ContentFormat.IMAGE }, options);
  }

  return Math.max(1, total);
}

/**
 * Charge for items that completed (or failed after work) in a run.
 */
export function chargeBatchGenerationCredits(
  items: readonly BatchItemPricingInput[],
  options: BatchPricingOptions = {},
): number {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + batchItemCredits(item, options), 0);
}

/**
 * Human-readable breakdown for UI.
 */
export function formatBatchPricingHint(
  options: BatchPricingOptions = {},
): string {
  const mult = batchCaptionModelMultiplier(
    options.qualityTier,
    options.chatModelRoundCredits,
  );
  const caption = Math.ceil(BATCH_CAPTION_BASE_CREDITS * mult);
  return `Caption ~${caption} + media (image ${BATCH_FORMAT_MEDIA_CREDITS.image}, reel ${BATCH_FORMAT_MEDIA_CREDITS.reel}, video ${BATCH_FORMAT_MEDIA_CREDITS.video})`;
}
