import { ContentFormat } from '..';

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

/** Shared estimate/final-charge arithmetic for source-post variations. */
export function sourcePostVariationCredits(outputCount: number): number {
  if (!Number.isInteger(outputCount) || outputCount < 0) return 0;
  return outputCount * BATCH_CAPTION_BASE_CREDITS;
}

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

/** Quality tier assumed when the caller has no model context (agent UI). */
export const DEFAULT_BATCH_PRICING_QUALITY_TIER: BatchPricingQualityTier =
  'balanced';

export type BatchPricingContext = {
  /** Chat model round credits (from registry) — scales caption cost. */
  chatModelRoundCredits?: number | null;
  /**
   * Batch-level media intent: true only when the run produces a media asset for
   * every item. The agent batch pipeline is caption-first, so callers leave this
   * false and per-item `hasMedia` drives the media rate at charge time.
   */
  hasMediaGeneration?: boolean;
  qualityTier?: BatchPricingQualityTier;
};

/**
 * Single source of pricing flags for the agent estimate UI and the server
 * charge. Both call this so the estimate an operator approves and the amount
 * that is billed can never drift apart.
 */
export function resolveBatchPricingOptions(
  context: BatchPricingContext = {},
): BatchPricingOptions {
  return {
    chatModelRoundCredits: context.chatModelRoundCredits ?? null,
    includeMedia: context.hasMediaGeneration === true,
    qualityTier: context.qualityTier ?? DEFAULT_BATCH_PRICING_QUALITY_TIER,
  };
}

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
 * Largest-remainder allocation so non-negative weights always sum to `total`.
 * Negative and zero weights are clamped; a zero-weight set puts everything on
 * the first key so callers never invent phantom over-allocation.
 */
export function allocateByWeights(
  total: number,
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  const safeTotal = Math.max(0, Math.floor(total));
  const keys = Object.keys(weights);
  if (keys.length === 0) {
    return {};
  }

  const clamped = keys.map((key, index) => ({
    fraction: 0,
    index,
    key,
    weight: Math.max(0, weights[key] ?? 0),
  }));
  const weightTotal = clamped.reduce((sum, entry) => sum + entry.weight, 0);

  if (weightTotal <= 0) {
    return Object.fromEntries(
      keys.map((key, index) => [key, index === 0 ? safeTotal : 0]),
    );
  }

  const allocations = clamped.map((entry) => {
    const exact = (entry.weight / weightTotal) * safeTotal;
    return {
      count: Math.floor(exact),
      fraction: exact % 1,
      index: entry.index,
      key: entry.key,
    };
  });

  let remaining =
    safeTotal - allocations.reduce((sum, entry) => sum + entry.count, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  for (let index = 0; remaining > 0; index++, remaining--) {
    byRemainder[index % byRemainder.length].count += 1;
  }

  return Object.fromEntries(
    allocations.map((entry) => [entry.key, entry.count]),
  );
}

/**
 * Estimate total tool credits for a batch before run.
 * Uses weighted content mix with largest-remainder counts that sum to
 * `count` exactly; does not include chat-round cost.
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

  const formatCounts = allocateByWeights(count, {
    [ContentFormat.IMAGE]: Math.max(0, mix[ContentFormat.IMAGE] ?? 0),
    [ContentFormat.VIDEO]: Math.max(0, mix[ContentFormat.VIDEO] ?? 0),
    [ContentFormat.CAROUSEL]: Math.max(0, mix[ContentFormat.CAROUSEL] ?? 0),
    [ContentFormat.REEL]: Math.max(0, mix[ContentFormat.REEL] ?? 0),
    [ContentFormat.STORY]: Math.max(0, mix[ContentFormat.STORY] ?? 0),
  });

  let total = 0;
  for (const format of Object.values(ContentFormat)) {
    const formatCount = formatCounts[format] ?? 0;
    if (formatCount <= 0) {
      continue;
    }
    total +=
      formatCount * batchItemCredits({ format, hasMedia: false }, options);
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

export type BatchChargeReconciliation = {
  /** Credits still owed on top of what was already billed (0 when none). */
  additionalCredits: number;
  /** Credits to hand back because the batch cost less than billed. */
  refundCredits: number;
  /** Media-aware total for the items that actually landed. */
  settledCredits: number;
};

/**
 * Settle an up-front estimate against what a batch actually produced.
 *
 * The async batch path bills the estimate before processing starts, so items
 * that come back carrying media are under-billed and a batch that fails
 * outright is over-billed. Charging the delta (or refunding it) keeps the
 * charge media-aware on both the streamed and the async path.
 */
export function reconcileBatchGenerationCredits(
  chargedCredits: number,
  items: readonly BatchItemPricingInput[],
  options: BatchPricingOptions = {},
): BatchChargeReconciliation {
  const settledCredits = chargeBatchGenerationCredits(items, options);
  const billed = Math.max(0, chargedCredits);
  const delta = settledCredits - billed;

  return {
    additionalCredits: delta > 0 ? delta : 0,
    refundCredits: delta < 0 ? -delta : 0,
    settledCredits,
  };
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
