/**
 * Deterministic post repurposing for scheduler channels.
 *
 * Given an existing post's caption and media, produce the caption a different
 * channel can carry — no LLM, reproducible, and unit-testable. The transform
 * leans entirely on the channel capability catalog
 * ({@link ./channel-capabilities.contract}) so composer UI, API, and agent
 * tools describe the same outcome. Feature spec: issue #2588.
 *
 * The transform never invents content. It only:
 * - removes caption links on channels where links are not clickable,
 * - trims hashtags beyond the channel's useful count (first occurrences win),
 * - truncates to the channel caption limit at a sentence boundary when one
 *   lands late enough, else at a word boundary with an ellipsis, else hard.
 *
 * Incompatible media (unsupported kind, too many items) is a rejection with
 * the catalog's actionable message — never a silent drop. Draft-stage gaps
 * (missing required media or caption) stay recorded issues on the produced
 * draft, matching how draft channel targets already persist validation state.
 */

import { z } from 'zod';
import { CredentialPlatform } from '../..';
import {
  type ChannelTargetValidationResult,
  type ChannelValidationIssue,
  channelTargetValidationMediaSchema,
  getChannelCapability,
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from './channel-capabilities.contract';

/**
 * Per-channel caption text policy the deterministic transform applies before
 * length truncation. `maxHashtags: undefined` means the channel has no useful
 * hashtag ceiling and every hashtag is kept.
 */
export const channelTextPolicySchema = z.object({
  hasClickableLinks: z.boolean(),
  maxHashtags: z.number().int().min(0).optional(),
});

export const channelRepurposeAdjustmentSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const repurposePostContentInputSchema = z.object({
  caption: z.string(),
  media: z.array(channelTargetValidationMediaSchema).optional(),
  targetPlatform: z.union([
    z.nativeEnum(CredentialPlatform),
    z.string().min(1),
  ]),
});

export type ChannelTextPolicy = z.infer<typeof channelTextPolicySchema>;
export type ChannelRepurposeAdjustment = z.infer<
  typeof channelRepurposeAdjustmentSchema
>;
export type RepurposePostContentInput = z.infer<
  typeof repurposePostContentInputSchema
>;
export type ChannelRepurposeMedia = z.infer<
  typeof channelTargetValidationMediaSchema
>;

export interface ChannelRepurposeSuccess {
  adjustments: ChannelRepurposeAdjustment[];
  caption: string;
  media: ChannelRepurposeMedia[];
  ok: true;
  validation: ChannelTargetValidationResult;
}

export interface ChannelRepurposeFailure {
  errors: ChannelValidationIssue[];
  ok: false;
  platform: CredentialPlatform | string;
}

export type ChannelRepurposeOutcome =
  | ChannelRepurposeSuccess
  | ChannelRepurposeFailure;

/**
 * Issue codes that make a repurpose impossible rather than merely incomplete.
 * Everything else (missing required media/caption, readiness) is a normal
 * draft-stage gap: draft channel targets already persist those issues and the
 * composer resolves them before scheduling.
 */
const HARD_FAILURE_CODES = new Set<string>([
  'channel_target.hidden_channel',
  'channel_target.invalid_payload',
  'channel_target.missing_capability',
  'channel_target.planned_channel',
  'channel_target.too_many_media_items',
  'channel_target.unsupported_media_kind',
  'channel_target.unsupported_platform',
]);

/**
 * Hashtag ceilings reflect each channel's discovery mechanics, not a formal
 * API limit; link handling reflects whether caption links are clickable at
 * all on the published surface. Channels without an entry keep hashtags and
 * links untouched.
 */
const CHANNEL_TEXT_POLICIES: Partial<
  Record<CredentialPlatform, ChannelTextPolicy>
> = {
  [CredentialPlatform.FACEBOOK]: { hasClickableLinks: true, maxHashtags: 3 },
  [CredentialPlatform.INSTAGRAM]: { hasClickableLinks: false, maxHashtags: 30 },
  [CredentialPlatform.LINKEDIN]: { hasClickableLinks: true, maxHashtags: 5 },
  [CredentialPlatform.MASTODON]: { hasClickableLinks: true, maxHashtags: 5 },
  [CredentialPlatform.MEDIUM]: { hasClickableLinks: true, maxHashtags: 0 },
  [CredentialPlatform.PINTEREST]: { hasClickableLinks: false, maxHashtags: 5 },
  [CredentialPlatform.REDDIT]: { hasClickableLinks: true, maxHashtags: 0 },
  [CredentialPlatform.THREADS]: { hasClickableLinks: true, maxHashtags: 1 },
  [CredentialPlatform.TIKTOK]: { hasClickableLinks: false, maxHashtags: 5 },
  [CredentialPlatform.TWITTER]: { hasClickableLinks: true, maxHashtags: 2 },
  [CredentialPlatform.YOUTUBE]: { hasClickableLinks: true, maxHashtags: 3 },
};

const DEFAULT_TEXT_POLICY: ChannelTextPolicy = { hasClickableLinks: true };

/**
 * A sentence cut is only taken when it keeps at least this share of the
 * caption budget — a two-word "sentence" at the top of a 3,000-character
 * budget is worse than a word-boundary cut further in.
 */
const SENTENCE_CUT_MIN_RETENTION = 0.5;

/**
 * A word cut below this share of the budget (continuous-script captions,
 * emoji walls) degrades to a hard code-point cut instead of dropping nearly
 * everything after the last whitespace.
 */
const WORD_CUT_MIN_RETENTION = 0.25;

const ELLIPSIS = '…';

const LINK_PATTERN = /https?:\/\/\S+/giu;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;
const SENTENCE_END_CHARS = new Set(['.', '!', '?']);

export function getChannelTextPolicy(
  platform: CredentialPlatform | string,
): ChannelTextPolicy {
  const parsed = z.nativeEnum(CredentialPlatform).safeParse(platform);
  const policy = parsed.success
    ? CHANNEL_TEXT_POLICIES[parsed.data]
    : undefined;
  return policy ? { ...policy } : { ...DEFAULT_TEXT_POLICY };
}

/**
 * Pure, deterministic repurpose of post content for a target channel.
 *
 * Success carries the transformed caption, the untouched media list, every
 * adjustment the transform made, and the target's draft-mode validation
 * snapshot (whose remaining errors are draft-stage gaps, not rejections).
 * Failure carries only hard incompatibilities, each with the catalog's
 * actionable message.
 */
export function repurposePostContent(
  input: RepurposePostContentInput,
): ChannelRepurposeOutcome {
  const parsedInput = repurposePostContentInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      errors: parsedInput.error.issues.map((issue) => ({
        code: 'channel_target.invalid_payload',
        field: issue.path.join('.') || undefined,
        message: issue.message,
        severity: 'error' as const,
      })),
      ok: false,
      platform:
        typeof input.targetPlatform === 'string'
          ? input.targetPlatform
          : 'unknown',
    };
  }

  const { caption, media, targetPlatform } = parsedInput.data;
  const capability = getChannelCapability(targetPlatform);
  const policy = getChannelTextPolicy(targetPlatform);
  const adjustments: ChannelRepurposeAdjustment[] = [];

  let transformed = caption;
  if (capability) {
    transformed = applyLinkPolicy(
      transformed,
      policy,
      capability.label,
      adjustments,
    );
    transformed = applyHashtagPolicy(
      transformed,
      policy,
      capability.label,
      adjustments,
    );
    transformed = truncateCaption(
      transformed,
      capability.caption.maxLength,
      capability.label,
      adjustments,
    );
  }

  const validation = validateChannelTargetSettings({
    caption: transformed,
    media,
    platform: targetPlatform,
    publishMode: 'draft',
    settings: capability
      ? resolveChannelTargetSettings(targetPlatform, {})
      : {},
  });

  const hardErrors = validation.errors.filter((issue) =>
    HARD_FAILURE_CODES.has(issue.code),
  );
  if (hardErrors.length > 0) {
    return { errors: hardErrors, ok: false, platform: validation.platform };
  }

  return {
    adjustments,
    caption: transformed,
    media: media ? media.map((item) => ({ ...item })) : [],
    ok: true,
    validation,
  };
}

function applyLinkPolicy(
  caption: string,
  policy: ChannelTextPolicy,
  channelLabel: string,
  adjustments: ChannelRepurposeAdjustment[],
): string {
  if (policy.hasClickableLinks) {
    return caption;
  }

  const links = caption.match(LINK_PATTERN) ?? [];
  if (links.length === 0) {
    return caption;
  }

  adjustments.push({
    code: 'channel_repurpose.links_removed',
    message: `${channelLabel} captions do not support clickable links; removed ${links.length} link${links.length === 1 ? '' : 's'}.`,
  });

  return tidyWhitespace(caption.replace(LINK_PATTERN, ''));
}

function applyHashtagPolicy(
  caption: string,
  policy: ChannelTextPolicy,
  channelLabel: string,
  adjustments: ChannelRepurposeAdjustment[],
): string {
  if (policy.maxHashtags === undefined) {
    return caption;
  }

  const hashtags = caption.match(HASHTAG_PATTERN) ?? [];
  if (hashtags.length <= policy.maxHashtags) {
    return caption;
  }

  const removedCount = hashtags.length - policy.maxHashtags;
  adjustments.push({
    code: 'channel_repurpose.hashtags_trimmed',
    message: `${channelLabel} works best with at most ${policy.maxHashtags} hashtag${policy.maxHashtags === 1 ? '' : 's'}; kept the first ${policy.maxHashtags} and removed ${removedCount}.`,
  });

  let seen = 0;
  const trimmed = caption.replace(HASHTAG_PATTERN, (hashtag) => {
    seen += 1;
    return seen <= (policy.maxHashtags as number) ? hashtag : '';
  });

  return tidyWhitespace(trimmed);
}

function truncateCaption(
  caption: string,
  maxLength: number,
  channelLabel: string,
  adjustments: ChannelRepurposeAdjustment[],
): string {
  const codePoints = Array.from(caption);
  if (codePoints.length <= maxLength) {
    return caption;
  }

  const truncated =
    cutAtSentenceBoundary(codePoints, maxLength) ??
    cutAtWordBoundary(codePoints, maxLength) ??
    `${codePoints.slice(0, maxLength - 1).join('')}${ELLIPSIS}`;

  adjustments.push({
    code: 'channel_repurpose.caption_truncated',
    message: `Caption shortened from ${codePoints.length} to ${Array.from(truncated).length} characters to fit the ${channelLabel} limit of ${maxLength}.`,
  });

  return truncated;
}

function cutAtSentenceBoundary(
  codePoints: readonly string[],
  maxLength: number,
): string | undefined {
  const minimumEnd = Math.floor(maxLength * SENTENCE_CUT_MIN_RETENTION);

  for (let index = maxLength - 1; index >= minimumEnd; index -= 1) {
    const character = codePoints[index];
    const next = codePoints[index + 1];
    if (
      character !== undefined &&
      SENTENCE_END_CHARS.has(character) &&
      (next === undefined || /\s/u.test(next))
    ) {
      return codePoints.slice(0, index + 1).join('');
    }
  }

  return undefined;
}

function cutAtWordBoundary(
  codePoints: readonly string[],
  maxLength: number,
): string | undefined {
  const budget = maxLength - 1;
  const minimumEnd = Math.floor(maxLength * WORD_CUT_MIN_RETENTION);

  for (let index = budget; index >= minimumEnd; index -= 1) {
    const character = codePoints[index];
    if (character !== undefined && /\s/u.test(character)) {
      const kept = codePoints.slice(0, index).join('').trimEnd();
      if (kept.length > 0) {
        return `${kept}${ELLIPSIS}`;
      }
    }
  }

  return undefined;
}

/** Collapse doubled spaces and orphaned space-before-punctuation left by token removal. */
function tidyWhitespace(caption: string): string {
  return caption
    .replace(/[^\S\n]+([,.;:!?])/gu, '$1')
    .replace(/[^\S\n]{2,}/gu, ' ')
    .replace(/[^\S\n]+$/gmu, '')
    .trim();
}
