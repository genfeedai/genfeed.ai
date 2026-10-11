import { ModelCategory, PostCategory } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import {
  DEFAULT_AGENT_VIDEO_DURATION_SECONDS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

export type BreakoutMediaFormat = 'image' | 'carousel' | 'video' | 'short';

/** A carousel response is three visuals; a channel that holds fewer carries what it holds. */
export const BREAKOUT_CAROUSEL_PARTS = 3;

export type BreakoutMediaFormatPlan = Readonly<{
  format: BreakoutMediaFormat;
  /** Generation model category for every visual of the output. */
  modelCategory: ModelCategory.IMAGE | ModelCategory.VIDEO;
  /** Brand-capability media kind of those visuals. */
  mediaKind: 'image' | 'video';
  /** Visuals generated and attached to the one post of the output. */
  parts: number;
  /** Canonical post category; the post material layout reads REEL as a short. */
  postCategory: PostCategory.IMAGE | PostCategory.VIDEO | PostCategory.REEL;
  aspectRatio: string;
  height: number;
  width: number;
  /** Seconds, video and short only. */
  durationSeconds: number | null;
}>;

/**
 * Why a platform/format pair stays held. A precise reason, never a blanket hold:
 * - `platform_publishing_unavailable`: the channel catalog does not publish for this platform yet
 *   (hidden or planned, or unknown).
 * - `format_unsupported_for_platform`: the platform publishes, but not this visual format.
 */
export type BreakoutMediaFormatHeldReason =
  | 'platform_publishing_unavailable'
  | 'format_unsupported_for_platform';

export type BreakoutMediaFormatSupport =
  | { status: 'supported'; plan: BreakoutMediaFormatPlan }
  | { status: 'held'; reason: BreakoutMediaFormatHeldReason };

const MEDIA_FORMATS: readonly BreakoutMediaFormat[] = [
  'image',
  'carousel',
  'video',
  'short',
];

export function isBreakoutMediaFormat(
  format: string,
): format is BreakoutMediaFormat {
  return MEDIA_FORMATS.some((value) => value === format);
}

function plan(
  format: BreakoutMediaFormat,
  parts: number,
): BreakoutMediaFormatPlan {
  const video = format === 'video' || format === 'short';
  const aspectRatio =
    format === 'short' ? '9:16' : format === 'video' ? '16:9' : '1:1';
  const { height, width } = resolveAgentGenerationDimensions(aspectRatio);
  return {
    format,
    modelCategory: video ? ModelCategory.VIDEO : ModelCategory.IMAGE,
    mediaKind: video ? 'video' : 'image',
    parts,
    postCategory:
      format === 'short'
        ? PostCategory.REEL
        : video
          ? PostCategory.VIDEO
          : PostCategory.IMAGE,
    aspectRatio,
    height,
    width,
    durationSeconds: video ? DEFAULT_AGENT_VIDEO_DURATION_SECONDS : null,
  };
}

/**
 * Whether the product can publish this visual format on this platform, read from the same
 * channel capability catalog the scheduler validates against (`validateChannelTargetSettings`),
 * so a response is never generated for a format its channel would refuse.
 */
export function resolveBreakoutMediaFormat(
  platform: string,
  format: LearningFormat,
): BreakoutMediaFormatSupport {
  if (!isBreakoutMediaFormat(format))
    return { status: 'held', reason: 'format_unsupported_for_platform' };
  const capability = getChannelCapability(platform);
  if (capability?.status !== 'supported')
    return { status: 'held', reason: 'platform_publishing_unavailable' };
  const { kinds, maxItems } = capability.media;
  const capacity = maxItems ?? Number.POSITIVE_INFINITY;
  const unsupported = {
    status: 'held',
    reason: 'format_unsupported_for_platform',
  } as const;
  switch (format) {
    case 'image':
      return kinds.includes('image') && capacity >= 1
        ? { status: 'supported', plan: plan(format, 1) }
        : unsupported;
    case 'carousel': {
      // A carousel is two or more images in one post: the explicit carousel kind, or a channel
      // that carries several images.
      const carries = kinds.includes('carousel') || kinds.includes('image');
      const parts = Math.min(BREAKOUT_CAROUSEL_PARTS, capacity);
      return carries && parts >= 2
        ? { status: 'supported', plan: plan(format, parts) }
        : unsupported;
    }
    case 'video':
      return kinds.includes('video') && capacity >= 1
        ? { status: 'supported', plan: plan(format, 1) }
        : unsupported;
    case 'short':
      return kinds.includes('short_video') && capacity >= 1
        ? { status: 'supported', plan: plan(format, 1) }
        : unsupported;
  }
}
