import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  type ChannelTargetValidationResult,
  getChannelCapability,
  getSupportedPostVisibilities,
  resolveChannelTargetSettings,
  type ValidateChannelTargetSettingsInput,
  validateChannelTargetSettings,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import type { IChannelTargetError } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/**
 * A credential and platform are required before a Post can move toward
 * SCHEDULED / PUBLISHING / PUBLISHED. Shared by `create` and `patch` so both
 * paths reject an under-specified target the same way, before any write.
 */
export function assertPublishTarget(
  status: TargetExecutionState | undefined,
  credentialId: string | null | undefined,
  platform: string | null | undefined,
): void {
  const normalizedStatus = status?.toLowerCase();
  if (
    normalizedStatus !== TargetExecutionState.SCHEDULED &&
    normalizedStatus !== TargetExecutionState.PUBLISHING &&
    normalizedStatus !== TargetExecutionState.PUBLISHED
  ) {
    return;
  }

  if (!credentialId || !platform) {
    throw new BadRequestException(
      'A credential and platform are required before scheduling or publishing a post.',
    );
  }
}

/**
 * The chosen visibility must be one the target platform's capability catalog
 * actually supports. Shared by `create` and `patch`.
 */
export function assertVisibilitySupported(
  visibility: PostVisibility,
  platform: string | null | undefined,
): void {
  if (!platform && visibility === PostVisibility.PUBLIC) {
    return;
  }
  if (
    !platform ||
    !getSupportedPostVisibilities(platform).includes(visibility)
  ) {
    throw new BadRequestException(
      `${platform ?? 'The selected platform'} does not support ${visibility} visibility.`,
    );
  }
}

/**
 * Single choke point for "does this content satisfy the target channel"
 * (#5193). `validateChannelTargetSettings` (the contract) is the source of
 * truth for per-platform caption/media/settings/visibility rules; everything
 * here only shapes Post-shaped data into its input and turns the result into
 * the same failure shapes every caller needs — a thrown exception for
 * interactive paths, an `IChannelTargetError` for background paths that fail
 * one target without breaking the rest of a batch.
 */

export type ChannelValidationMedia = NonNullable<
  ValidateChannelTargetSettingsInput['media']
>;

/** Minimal Post-shaped input every call site can build from what it already has. */
export type SchedulableChannelTargetFields = {
  caption?: string | null;
  category?: string | null;
  credentialId?: string | null;
  ingredients?: unknown;
  media?: ChannelValidationMedia;
  platform?: string | null;
  publishMode?: ValidateChannelTargetSettingsInput['publishMode'];
  settings?: Record<string, unknown> | null;
  visibility?: string | null;
};

export function mediaKindForCategory(
  category: string | null | undefined,
): ChannelValidationMedia[number]['kind'] {
  return category === PostCategory.VIDEO || category === PostCategory.REEL
    ? 'video'
    : 'image';
}

/**
 * Ingredient ids come in three shapes across call sites: a plain `string[]`
 * (DTOs), a populated relation array of `{ id }` (Prisma/PostDocument), or
 * `unknown` (JSON-shaped inputs). This normalizes all three.
 */
export function extractIngredientIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return (value as unknown[]).flatMap((ingredient) => {
    const id =
      typeof ingredient === 'string'
        ? ingredient
        : ingredient && typeof ingredient === 'object' && 'id' in ingredient
          ? (ingredient as { id?: unknown }).id
          : undefined;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

/** Build validation media from resolved ingredient ids, before any Post row exists. */
export function toValidationMediaFromIngredientIds(
  ingredientIds: readonly string[] | undefined,
  category: string | null | undefined,
): ChannelValidationMedia | undefined {
  const ids = (ingredientIds ?? []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (ids.length === 0) {
    return undefined;
  }
  const kind = mediaKindForCategory(category);
  return ids.map((id) => ({ id, kind }));
}

/**
 * Build validation media from a persisted Post's populated `ingredients`
 * relation. Moved out of the workers-only media gate util so the API layer's
 * schedule-time choke point and the workers' publish-time re-check share one
 * mapping instead of drifting.
 */
export function toValidationMedia(
  post: Pick<PostEntity | PostDocument, 'category'> & {
    ingredients?: unknown;
  },
): ChannelValidationMedia | undefined {
  return toValidationMediaFromIngredientIds(
    extractIngredientIds(post.ingredients),
    post.category,
  );
}

/**
 * Resolve raw stored settings against the current capability catalog,
 * substituting declared defaults exactly as the publish-time worker check
 * does. Without this, a target that never had a settings UI (a standalone
 * Post, an autopilot draft) would fail validation on a required-with-default
 * setting it was never asked to fill in.
 */
export function resolveTargetSettingsForValidation(
  platform: string | null | undefined,
  rawSettings: unknown,
): Record<string, unknown> {
  if (!platform) {
    return {};
  }
  return resolveChannelTargetSettings(platform, rawSettings ?? {});
}

/**
 * Build the contract's validation input from Post-shaped fields, or `null`
 * when there is nothing to validate against yet (no platform chosen — still
 * an unassigned draft).
 */
export function buildChannelTargetScheduleInput(
  fields: SchedulableChannelTargetFields,
): ValidateChannelTargetSettingsInput | null {
  if (!fields.platform) {
    return null;
  }
  return {
    caption: fields.caption ?? '',
    credentialId: fields.credentialId ?? undefined,
    media:
      fields.media ??
      toValidationMediaFromIngredientIds(
        extractIngredientIds(fields.ingredients),
        fields.category,
      ),
    platform: fields.platform,
    publishMode: fields.publishMode ?? 'scheduled',
    settings: resolveTargetSettingsForValidation(
      fields.platform,
      fields.settings ?? {},
    ),
    visibility: fields.visibility ?? undefined,
  } as ValidateChannelTargetSettingsInput;
}

/** The contract's first blocking issue, shaped for `Post.targetError`. */
export function toChannelTargetError(
  validation: ChannelTargetValidationResult,
): IChannelTargetError | null {
  const issue = validation.errors[0];
  if (!issue) {
    return null;
  }
  return {
    code: issue.code,
    failedAt: new Date().toISOString(),
    isRetryable: false,
    message: issue.message,
  };
}

/**
 * Thrown by the schedule-time choke point when content fails the channel
 * contract. Distinguished from a generic `BadRequestException` so background
 * fan-out callers can catch specifically this and fail (or skip) the one
 * target instead of the whole batch.
 */
export class InvalidChannelTargetScheduleException extends BadRequestException {
  constructor(public readonly validation: ChannelTargetValidationResult) {
    const issue = validation.errors[0];
    super({
      code: issue?.code ?? 'channel_target.invalid',
      detail:
        [...validation.errors, ...validation.warnings]
          .map((entry) => entry.message)
          .join('; ') || 'Channel target failed validation.',
      title: 'Invalid channel target',
    });
  }
}

/**
 * Validate Post-shaped fields against the channel contract and throw
 * `InvalidChannelTargetScheduleException` when they fail. Returns `null` when
 * there was nothing to validate (no platform chosen).
 */
export function assertValidChannelTargetSchedule(
  fields: SchedulableChannelTargetFields,
): ChannelTargetValidationResult | null {
  const input = buildChannelTargetScheduleInput(fields);
  if (!input) {
    return null;
  }
  const validation = validateChannelTargetSettings(input);
  if (!validation.valid) {
    throw new InvalidChannelTargetScheduleException(validation);
  }
  return validation;
}

/**
 * Whether a platform's capability accepts the given media (or no media at
 * all). Used by fan-out producers (autopilot auto-publish, the workflow
 * Publish node) to filter out platforms the content cannot satisfy *before*
 * creating a post for them, rather than creating one per connected account
 * and letting the schedule-time choke point reject it after the fact.
 */
export function channelAcceptsMedia(
  platform: string,
  media: ChannelValidationMedia | undefined,
): boolean {
  const capability = getChannelCapability(platform);
  if (!capability) {
    return false;
  }
  const validation = validateChannelTargetSettings({
    caption: ' ',
    media,
    platform,
    publishMode: 'scheduled',
  });
  return !validation.errors.some(
    (issue) =>
      issue.code === 'channel_target.media_required' ||
      issue.code === 'channel_target.unsupported_media_kind' ||
      issue.code === 'channel_target.too_many_media_items',
  );
}

/**
 * Partition fan-out targets into those the content can satisfy and those it
 * cannot, by media compatibility alone (caption/settings/visibility are the
 * same across every fanned-out account, so only media varies per platform).
 */
export function filterTargetsByMediaCapability<T extends { platform: string }>(
  targets: readonly T[],
  media: ChannelValidationMedia | undefined,
): { eligible: T[]; skipped: T[] } {
  const eligible: T[] = [];
  const skipped: T[] = [];
  for (const target of targets) {
    (channelAcceptsMedia(target.platform, media) ? eligible : skipped).push(
      target,
    );
  }
  return { eligible, skipped };
}
