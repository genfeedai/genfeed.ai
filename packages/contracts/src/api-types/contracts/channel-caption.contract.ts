/**
 * Caption length rules for scheduler channels.
 *
 * Lengths are counted the way the channel counts them (`measurePlatformText`:
 * weighted on X, graphemes on Bluesky, code points elsewhere), so validation,
 * the preview and the publisher agree.
 *
 * `maxLength` is the standard length a channel counts against. A channel whose
 * limit depends on the connected account (X long posts need Premium) also
 * declares `extendedMaxLength`. A caption between the two is a warning and the
 * provider decides; only a caption past the ceiling is an error.
 */
import type { ChannelValidationIssue } from './channel-setting-validation.contract';
import { measurePlatformText } from './platform-text-length.contract';

interface CaptionLimits {
  maxLength: number;
  extendedMaxLength?: number;
  maxHashtags?: number;
}

/** A hashtag the way a caption writes one: `#` and the word after it. */
export const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;

export function countHashtags(text: string): number {
  return text.match(HASHTAG_PATTERN)?.length ?? 0;
}

/**
 * The hashtag rule a model prompt gives for a caption, as a clause to follow
 * "must" or a bare imperative. Every path that asks a model for a caption reads
 * it from the channel capability catalog (`caption.maxHashtags`), so one number
 * reaches every prompt.
 */
export function describeHashtagRule(maxHashtags: number): string {
  if (maxHashtags === 0) return 'use no hashtags';
  return `use at most ${maxHashtags} hashtag${maxHashtags === 1 ? '' : 's'}`;
}

/** The slice of a channel capability the caption rules read. */
interface CaptionRuleChannel {
  label: string;
  platform: string;
  caption: CaptionLimits & { required?: boolean };
}

/** The slice of a target's settings the caption rules read. */
interface CaptionRuleInput {
  caption?: string | null;
}

/** The longest caption a channel accepts: its extended ceiling, else its limit. */
export function getCaptionCeiling(caption: CaptionLimits): number {
  return caption.extendedMaxLength ?? caption.maxLength;
}

/**
 * The length rule a model prompt gives for a caption, as a clause to follow
 * "must". A channel with an extended ceiling names the standard length and
 * allows a longer post only when the brief or the brand voice asks for one, so
 * the ceiling never becomes the target.
 */
export function describeCaptionLengthRule(caption: CaptionLimits): string {
  const ceiling = getCaptionCeiling(caption);
  if (ceiling <= caption.maxLength) {
    return `stay within ${caption.maxLength} characters`;
  }
  return `stay within ${caption.maxLength} characters unless the brief or the brand voice asks for a longer post (never more than ${ceiling} characters)`;
}

export function validateCaption(
  input: CaptionRuleInput,
  capability: CaptionRuleChannel,
): ChannelValidationIssue[] {
  const caption = input.caption ?? '';
  const captionLength = measurePlatformText(caption, capability.platform);
  const errors: ChannelValidationIssue[] = [];

  if (capability.caption.required && caption.trim().length === 0) {
    errors.push({
      code: 'channel_target.caption_required',
      field: 'caption',
      message: `${capability.label} requires caption text.`,
      severity: 'error',
    });
  }

  const ceiling = getCaptionCeiling(capability.caption);
  if (captionLength > ceiling) {
    errors.push({
      code: 'channel_target.caption_too_long',
      field: 'caption',
      message: `${capability.label} captions must be ${ceiling} characters or fewer.`,
      severity: 'error',
    });
  }

  return errors;
}

export function collectCaptionWarnings(
  input: CaptionRuleInput,
  capability: CaptionRuleChannel,
): ChannelValidationIssue[] {
  const warnings: ChannelValidationIssue[] = [];
  const caption = input.caption ?? '';
  const { extendedMaxLength, maxHashtags, maxLength } = capability.caption;

  if (extendedMaxLength !== undefined) {
    const captionLength = measurePlatformText(caption, capability.platform);
    if (captionLength > maxLength && captionLength <= extendedMaxLength) {
      warnings.push({
        code: 'channel_target.caption_over_standard_length',
        field: 'caption',
        message: `${capability.label} caption is ${captionLength} characters. Posts over ${maxLength} need an account with long posts enabled, otherwise ${capability.label} refuses them.`,
        severity: 'warning',
      });
    }
  }

  // A warning, not an error: what the channel does with one hashtag too many
  // has not been read back from a real publish.
  if (maxHashtags !== undefined) {
    const hashtagCount = countHashtags(caption);
    if (hashtagCount > maxHashtags) {
      warnings.push({
        code: 'channel_target.too_many_hashtags',
        field: 'caption',
        message: `${capability.label} allows at most ${maxHashtags} hashtag${maxHashtags === 1 ? '' : 's'} and this caption has ${hashtagCount}. Remove ${hashtagCount - maxHashtags}.`,
        severity: 'warning',
      });
    }
  }

  return warnings;
}
