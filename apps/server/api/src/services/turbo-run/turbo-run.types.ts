import type { ContentMixConfig } from '@api/services/turbo-run/schemas/turbo-run.schema';
import {
  TurboRunItemStatus,
  TurboRunStatus,
  ContentFormat,
  normalizeReviewDecision,
  ReviewDecision,
} from '@genfeedai/contracts';
import type { TurboRunPricingOptions } from '@genfeedai/contracts/constants';
import type {
  IPublishApproval,
  VideoContinuityQaReport,
} from '@genfeedai/contracts/interfaces';
import type { TurboRun } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';

export interface TurboRunItem {
  format: ContentFormat;
  status: TurboRunItemStatus;
  platform?: string;
  scheduledDate?: string;
}

export interface TurboRunItemFull extends TurboRunItem {
  id: string;
  caption?: string;
  prompt?: string;
  postId?: string;
  /**
   * Further posts publishing this item on other accounts (a batch project
   * schedules one draft per destination). Review decisions reach them too.
   */
  destinationPostIds?: string[];
  mediaUrl?: string;
  error?: string;
  assigneeId?: string | null;
  /** Distinguishes an engagement-reply item from a generated content item. */
  type?: 'content' | 'engagement';
  /** Quote/repost/reply distinction for an engagement item, when known. */
  engagementAction?: string;
  /** External (platform-native) ID of the post an engagement reply answers. */
  targetPostId?: string;
  targetPostUrl?: string;
  targetAuthor?: string;
  targetPostContent?: string;
  reviewDecision: ReviewDecision;
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewEvents?: Array<{
    decision: ReviewDecision;
    feedback?: string;
    reviewedAt: string;
    reviewerId?: string;
    /** Background rewrite job that wrote this event (#5365 settlement marker). */
    rewriteJobId?: string;
    versionPinId?: string;
  }>;
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
  creativeVersion?: string;
  hookVersion?: string;
  ingredientId?: string;
  contentRunId?: string;
  variantId?: string;
  scheduleSlot?: string;
  publishIntent?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  workflowExecutionId?: string;
  createdAt?: string;
  versionPinId?: string;
  publishApproval?: IPublishApproval;
  continuityQa?: VideoContinuityQaReport;
}

/**
 * Running total of credits actually moved for a batch.
 *
 * `chargedCredits` is the claimed net charge (up-front estimate plus any
 * settlement delta, minus refunds). It normally matches the amount deducted;
 * when the settlement delta fails, `Batch.settlementShortfall` records the
 * exact amount still collectible. Settlement always targets the price of what
 * landed and charges `target - chargedCredits`, so replaying settlement is a
 * no-op rather than a second charge.
 */
export type TurboRunCreditsLedger = {
  chargedCredits: number;
  refundedCredits?: number;
  /** Hold consumed when this batch reaches a terminal settlement. */
  reservationId?: string;
  /** Durable proof that the reservation transition completed. */
  reservationSettledAt?: string;
  settledAt?: string;
  /**
   * Monotonic count of settlement claims won for this batch. Each occurrence
   * keys its own credit-transaction reference, so a later legitimate delta is
   * never mistaken for a replay of an earlier one.
   */
  settlementSeq?: number;
};

export type TurboRunConfig = {
  contentMix?: ContentMixConfig;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  platforms?: string[];
  topics?: string[];
  completedCount?: number;
  failedCount?: number;
  totalCount?: number;
  completedAt?: string;
  source?: string;
  style?: string;
  credits?: TurboRunCreditsLedger;
  /**
   * Pricing inputs captured at creation. Stored on the batch rather than
   * carried in job data so a resumed run settles at the same rates as the run
   * it replaces.
   */
  pricing?: TurboRunPricingOptions;
  /** Set when the batch was handed to the turbo-run queue. */
  queuedAt?: string;
  /** Number of times a stranded run has been re-claimed and resumed. */
  resumeCount?: number;
};

export type TurboRunItemTypedRow = {
  assigneeId?: string | null;
  data?: unknown;
  isDeleted?: boolean;
};

export type TurboRunWithConfig = TurboRun & {
  turboRunItems?: TurboRunItemTypedRow[];
  config: TurboRunConfig;
  items: TurboRunItemFull[];
};

export interface TurboRunProcessItemContext {
  turboRunId: string;
  completedCount: number;
  error?: string;
  failedCount: number;
  index: number;
  item: TurboRunItemFull;
  postId?: string;
  previewText?: string;
  topic: string;
  totalCount: number;
}

export interface TurboRunProcessOptions {
  onTurboRunCompleted?: (params: {
    turboRunId: string;
    completedCount: number;
    failedCount: number;
    status: TurboRunStatus;
    totalCount: number;
  }) => Promise<void> | void;
  onTurboRunStarted?: (params: {
    turboRunId: string;
    totalCount: number;
  }) => Promise<void> | void;
  onItemCompleted?: (params: TurboRunProcessItemContext) => Promise<void> | void;
  onItemFailed?: (params: TurboRunProcessItemContext) => Promise<void> | void;
  onItemStarted?: (params: TurboRunProcessItemContext) => Promise<void> | void;
}

export interface ReviewInboxItemSummary {
  turboRunId: string;
  createdAt: string;
  format: string;
  id: string;
  mediaUrl?: string;
  platform?: string;
  postId?: string;
  reviewDecision: ReviewDecision;
  status: string;
  summary: string;
  continuityQa?: VideoContinuityQaReport;
  /** Why media gates want review of this item (#4881), when any. */
  mediaAssessmentReasons?: string[];
}

export interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: ReviewInboxItemSummary[];
  rejectedCount: number;
}

export function cloneTurboRunItems(
  items: TurboRun['items'] | null | undefined,
): TurboRunItemFull[] {
  return ((items ?? []) as unknown as TurboRunItemFull[]).map((item) => ({
    ...item,
    reviewDecision: normalizeReviewDecision(item.reviewDecision),
    reviewEvents: (item.reviewEvents ?? []).map((event) => ({
      ...event,
      decision: normalizeReviewDecision(event.decision),
    })),
  }));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function readContentMix(value: unknown): ContentMixConfig | undefined {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.carouselPercent) ||
    !isFiniteNumber(value.imagePercent) ||
    !isFiniteNumber(value.reelPercent) ||
    !isFiniteNumber(value.storyPercent) ||
    !isFiniteNumber(value.videoPercent)
  ) {
    return undefined;
  }

  return {
    carouselPercent: value.carouselPercent,
    imagePercent: value.imagePercent,
    reelPercent: value.reelPercent,
    storyPercent: value.storyPercent,
    videoPercent: value.videoPercent,
  };
}

function readCredits(value: unknown): TurboRunCreditsLedger | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.chargedCredits)) {
    return undefined;
  }

  const credits: TurboRunCreditsLedger = {
    chargedCredits: value.chargedCredits,
  };
  if (isFiniteNumber(value.refundedCredits)) {
    credits.refundedCredits = value.refundedCredits;
  }
  if (typeof value.reservationId === 'string') {
    credits.reservationId = value.reservationId;
  }
  if (typeof value.reservationSettledAt === 'string') {
    credits.reservationSettledAt = value.reservationSettledAt;
  }
  if (typeof value.settledAt === 'string') {
    credits.settledAt = value.settledAt;
  }
  if (isFiniteNumber(value.settlementSeq)) {
    credits.settlementSeq = value.settlementSeq;
  }
  return credits;
}

function readPricing(value: unknown): TurboRunPricingOptions | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const pricing: TurboRunPricingOptions = {};
  if (
    value.chatModelRoundCredits === null ||
    isFiniteNumber(value.chatModelRoundCredits)
  ) {
    pricing.chatModelRoundCredits = value.chatModelRoundCredits;
  }
  if (typeof value.includeMedia === 'boolean') {
    pricing.includeMedia = value.includeMedia;
  }
  if (value.qualityTier === null || typeof value.qualityTier === 'string') {
    pricing.qualityTier = value.qualityTier;
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function normalizeTurboRunConfig(value: unknown): TurboRunConfig {
  if (!isRecord(value)) {
    return {};
  }

  const config: TurboRunConfig = {};
  const contentMix = readContentMix(value.contentMix);
  const credits = readCredits(value.credits);
  const platforms = readStringArray(value.platforms);
  const pricing = readPricing(value.pricing);
  const topics = readStringArray(value.topics);

  if (contentMix) config.contentMix = contentMix;
  if (credits) config.credits = credits;
  if (platforms) config.platforms = platforms;
  if (pricing) config.pricing = pricing;
  if (topics) config.topics = topics;

  if (typeof value.dateRangeStart === 'string') {
    config.dateRangeStart = value.dateRangeStart;
  }
  if (typeof value.dateRangeEnd === 'string') {
    config.dateRangeEnd = value.dateRangeEnd;
  }
  if (typeof value.completedAt === 'string') {
    config.completedAt = value.completedAt;
  }
  if (typeof value.source === 'string') config.source = value.source;
  if (typeof value.style === 'string') config.style = value.style;
  if (typeof value.queuedAt === 'string') config.queuedAt = value.queuedAt;

  if (isFiniteNumber(value.completedCount)) {
    config.completedCount = value.completedCount;
  }
  if (isFiniteNumber(value.failedCount)) {
    config.failedCount = value.failedCount;
  }
  if (isFiniteNumber(value.totalCount)) config.totalCount = value.totalCount;
  if (isFiniteNumber(value.resumeCount)) {
    config.resumeCount = value.resumeCount;
  }

  return config;
}

export function toTurboRunWithConfig(
  turboRun: TurboRun & { turboRunItems?: TurboRunItemTypedRow[] | null },
): TurboRunWithConfig {
  return {
    ...turboRun,
    turboRunItems: turboRun.turboRunItems ?? undefined,
    config: normalizeTurboRunConfig(turboRun.config),
    items: resolveTurboRunItems(turboRun),
  } as unknown as TurboRunWithConfig;
}

/**
 * Reader ratchet: typed rows are authoritative for every identity they
 * represent, including tombstones. Legacy JSON contributes only identities
 * that have not migrated yet, so partial backfills neither truncate old items
 * nor resurrect deleted ones.
 */
export function resolveTurboRunItems(turboRun: {
  turboRunItems?: TurboRunItemTypedRow[] | null;
  items?: TurboRun['items'] | null;
}): TurboRunItemFull[] {
  const typedRows = turboRun.turboRunItems ?? [];
  if (typedRows.length === 0) {
    return cloneTurboRunItems(turboRun.items);
  }

  const representedIds = new Set(
    typedRows
      .map((row) => readTurboRunItemId(row.data))
      .filter((id): id is string => id !== undefined),
  );
  const liveTypedItems = typedRows
    .filter((row) => row.isDeleted !== true)
    .map((row) => overlayTypedAssignee(row));
  const legacyOnlyItems = cloneTurboRunItems(turboRun.items).filter(
    (item) => !representedIds.has(item.id),
  );

  return [
    ...cloneTurboRunItems(liveTypedItems as TurboRun['items']),
    ...legacyOnlyItems,
  ];
}

function readTurboRunItemId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
}

function overlayTypedAssignee(row: TurboRunItemTypedRow): unknown {
  const data = isRecord(row.data) ? row.data : {};
  const safeData = { ...data };
  delete safeData.assignee;

  return {
    ...safeData,
    assigneeId: row.assigneeId ?? data.assigneeId ?? null,
  };
}
