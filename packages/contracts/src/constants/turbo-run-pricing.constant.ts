import { ContentFormat } from '..';

/**
 * Turbo run pricing — shared by agent UI estimates and server charge.
 *
 * Every run item always incurs a **caption** LLM cost (scaled by model tier).
 * **Media** costs apply when the item's format needs media and media was (or
 * will be) produced. Format packaging reflects product intent even for
 * caption-first drafts.
 *
 * Chat model **round** cost is billed separately by the orchestrator.
 */

/** Base credits for one caption/text draft (before model multiplier). */
export const TURBO_RUN_CAPTION_BASE_CREDITS = 1;

/** Inclusive upper bound for one `generate_turbo_content` count. */
export const TURBO_RUN_COUNT_MAXIMUM = 100;

const CONTENT_MIX_PERCENT_KEYS: Record<ContentFormat, string> = {
  [ContentFormat.CAROUSEL]: 'carouselPercent',
  [ContentFormat.IMAGE]: 'imagePercent',
  [ContentFormat.REEL]: 'reelPercent',
  [ContentFormat.STORY]: 'storyPercent',
  [ContentFormat.VIDEO]: 'videoPercent',
};

/**
 * Tool `contentMix` uses *Percent fields. The estimator keys by ContentFormat.
 * An all-zero mix returns undefined so the default mix stays in force.
 */
export function contentMixFromToolArguments(
  input: unknown,
): Partial<Record<ContentFormat, number>> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const mix: Partial<Record<ContentFormat, number>> = {};
  let hasWeight = false;
  for (const format of Object.values(ContentFormat)) {
    const value = raw[CONTENT_MIX_PERCENT_KEYS[format]];
    const percent =
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : 0;
    mix[format] = percent;
    if (percent > 0) hasWeight = true;
  }
  return hasWeight ? mix : undefined;
}

/** Shared estimate/final-charge arithmetic for source-post variations. */
export function sourcePostVariationCredits(outputCount: number): number {
  if (!Number.isInteger(outputCount) || outputCount < 0) return 0;
  return outputCount * TURBO_RUN_CAPTION_BASE_CREDITS;
}

/**
 * Planned media / packaging cost by content format.
 * Tweet-like text slots use image format with caption-only when no media.
 */
export const TURBO_RUN_FORMAT_MEDIA_CREDITS: Record<ContentFormat, number> = {
  [ContentFormat.IMAGE]: 8,
  [ContentFormat.VIDEO]: 45,
  [ContentFormat.REEL]: 40,
  [ContentFormat.CAROUSEL]: 18,
  [ContentFormat.STORY]: 6,
};

/** Default content mix when the client does not pass one (matches run creation). */
export const DEFAULT_TURBO_CONTENT_MIX: Record<ContentFormat, number> = {
  [ContentFormat.IMAGE]: 60,
  [ContentFormat.VIDEO]: 25,
  [ContentFormat.CAROUSEL]: 10,
  [ContentFormat.REEL]: 5,
  [ContentFormat.STORY]: 0,
};

export type TurboRunPricingQualityTier =
  | 'budget'
  | 'balanced'
  | 'high_quality'
  | string
  | null
  | undefined;

/** Multiplier applied only to caption LLM cost. */
export function turboRunCaptionModelMultiplier(
  qualityTier?: TurboRunPricingQualityTier,
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

export type TurboRunItemPricingInput = {
  format: ContentFormat | string;
  /** When true, include full media cost for the format. */
  hasMedia?: boolean;
};

export type TurboRunPricingOptions = {
  /** Chat model round credits (from registry) — scales caption cost. */
  chatModelRoundCredits?: number | null;
  /**
   * When true (default for estimates), charge media rates for non-text formats.
   * When false, only caption + a small format packaging fee is charged
   * (current pipeline: caption drafts only).
   */
  includeMedia?: boolean;
  qualityTier?: TurboRunPricingQualityTier;
};

/** Quality tier assumed when the caller has no model context (agent UI). */
export const DEFAULT_TURBO_RUN_PRICING_QUALITY_TIER: TurboRunPricingQualityTier =
  'balanced';

export type TurboRunPricingContext = {
  /** Chat model round credits (from registry) — scales caption cost. */
  chatModelRoundCredits?: number | null;
  /**
   * Turbo run-level media intent: true only when the run produces a media asset for
   * every item. The agent run pipeline is caption-first, so callers leave this
   * false and per-item `hasMedia` drives the media rate at charge time.
   */
  hasMediaGeneration?: boolean;
  qualityTier?: TurboRunPricingQualityTier;
};

/**
 * Single source of pricing flags for the agent estimate UI and the server
 * charge. Both call this so the estimate an operator approves and the amount
 * that is billed can never drift apart.
 */
export function resolveTurboRunPricingOptions(
  context: TurboRunPricingContext = {},
): TurboRunPricingOptions {
  return {
    chatModelRoundCredits: context.chatModelRoundCredits ?? null,
    includeMedia: context.hasMediaGeneration === true,
    qualityTier: context.qualityTier ?? DEFAULT_TURBO_RUN_PRICING_QUALITY_TIER,
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
  if (value in TURBO_RUN_FORMAT_MEDIA_CREDITS) {
    return value;
  }
  return ContentFormat.IMAGE;
}

/**
 * Credits for a single run item.
 */
export function turboRunItemCredits(
  item: TurboRunItemPricingInput,
  options: TurboRunPricingOptions = {},
): number {
  const format = normalizeFormat(item.format);
  const caption = Math.ceil(
    TURBO_RUN_CAPTION_BASE_CREDITS *
      turboRunCaptionModelMultiplier(
        options.qualityTier,
        options.chatModelRoundCredits,
      ),
  );

  const includeMedia = options.includeMedia !== false;
  if (item.hasMedia || includeMedia) {
    return caption + (TURBO_RUN_FORMAT_MEDIA_CREDITS[format] ?? 0);
  }

  return caption + (FORMAT_PACKAGING_WITHOUT_MEDIA[format] ?? 0);
}

export type TurboRunEstimateInput = {
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
 * Estimate total tool credits for a run before run.
 * Uses weighted content mix with largest-remainder counts that sum to
 * `count` exactly; does not include chat-round cost.
 */
export function estimateTurboRunCredits(
  input: TurboRunEstimateInput,
  options: TurboRunPricingOptions = {},
): number {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0) {
    return 0;
  }

  const mix = {
    ...DEFAULT_TURBO_CONTENT_MIX,
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
      formatCount * turboRunItemCredits({ format, hasMedia: false }, options);
  }

  return Math.max(1, total);
}

/**
 * Charge for items that completed (or failed after work) in a run.
 */
export function chargeTurboRunCredits(
  items: readonly TurboRunItemPricingInput[],
  options: TurboRunPricingOptions = {},
): number {
  if (items.length === 0) {
    return 0;
  }
  return items.reduce((sum, item) => sum + turboRunItemCredits(item, options), 0);
}

export type TurboRunChargeReconciliation = {
  /** Credits still owed on top of what was already billed (0 when none). */
  additionalCredits: number;
  /** Credits to hand back because the run cost less than billed. */
  refundCredits: number;
  /** Media-aware total for the items that actually landed. */
  settledCredits: number;
};

/**
 * Settle an up-front estimate against what a run actually produced.
 *
 * The async run path bills the estimate before processing starts, so items
 * that come back carrying media are under-billed and a run that fails
 * outright is over-billed. Charging the delta (or refunding it) keeps the
 * charge media-aware on both the streamed and the async path.
 */
export function reconcileTurboRunCredits(
  chargedCredits: number,
  items: readonly TurboRunItemPricingInput[],
  options: TurboRunPricingOptions = {},
): TurboRunChargeReconciliation {
  const settledCredits = chargeTurboRunCredits(items, options);
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
export function formatTurboRunPricingHint(
  options: TurboRunPricingOptions = {},
): string {
  const mult = turboRunCaptionModelMultiplier(
    options.qualityTier,
    options.chatModelRoundCredits,
  );
  const caption = Math.ceil(TURBO_RUN_CAPTION_BASE_CREDITS * mult);
  return `Caption ~${caption} + media (image ${TURBO_RUN_FORMAT_MEDIA_CREDITS.image}, reel ${TURBO_RUN_FORMAT_MEDIA_CREDITS.reel}, video ${TURBO_RUN_FORMAT_MEDIA_CREDITS.video})`;
}
