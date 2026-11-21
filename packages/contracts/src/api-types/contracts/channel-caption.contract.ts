/**
 * Caption length rules for scheduler channels.
 *
 * `maxLength` is the standard length a channel counts against. A channel whose
 * limit depends on the connected account (X long posts need Premium) also
 * declares `extendedMaxLength`. A caption between the two is a warning and the
 * provider decides; only a caption past the ceiling is an error.
 */
import type { ChannelValidationIssue } from './channel-setting-validation.contract';

interface CaptionLimits {
  maxLength: number;
  extendedMaxLength?: number;
}

/** The slice of a channel capability the caption rules read. */
interface CaptionRuleChannel {
  label: string;
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

export function validateCaption(
  input: CaptionRuleInput,
  capability: CaptionRuleChannel,
): ChannelValidationIssue[] {
  const caption = input.caption ?? '';
  const captionLength = Array.from(caption).length;
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
  const { extendedMaxLength, maxLength } = capability.caption;
  if (extendedMaxLength === undefined) return [];

  const captionLength = Array.from(input.caption ?? '').length;
  if (captionLength <= maxLength || captionLength > extendedMaxLength) {
    return [];
  }

  return [
    {
      code: 'channel_target.caption_over_standard_length',
      field: 'caption',
      message: `${capability.label} caption is ${captionLength} characters. Posts over ${maxLength} need an account with long posts enabled, otherwise ${capability.label} refuses them.`,
      severity: 'warning',
    },
  ];
}
