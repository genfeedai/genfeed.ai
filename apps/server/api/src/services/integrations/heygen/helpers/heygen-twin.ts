import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HeyGenSubmissionRejectedError } from '@api/services/integrations/heygen/errors/heygen-submission-rejected.error';
import {
  readHeyGenErrorEnvelope,
  readHeyGenRetryAfter,
} from '@api/services/integrations/heygen/helpers/heygen-speech';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';

// Contracts: developers.heygen.com/docs/avatar-from-video.md, /docs/avatar-consent.md,
// /docs/direct-upload.md and /reference/get-avatar-look.md (read 2026-11-08).

/** Training footage the provider accepts: 15 s to 10 min of mp4 or webm. */
export const HEYGEN_TWIN_FOOTAGE_MIN_SECONDS = 15;
export const HEYGEN_TWIN_FOOTAGE_MAX_SECONDS = 600;
export const HEYGEN_TWIN_FOOTAGE_CONTENT_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;
/** Direct upload caps video at 200 MB; the simple endpoints stop at 50 MB. */
export const HEYGEN_DIRECT_UPLOAD_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
/** A consent video longer than this is rejected by the provider. */
export const HEYGEN_CONSENT_VIDEO_MAX_SECONDS = 35;
/** The consent link the provider returns stays valid for 24 hours. */
export const HEYGEN_CONSENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
export const HEYGEN_TWIN_REQUEST_TIMEOUT_MS = 30_000;
/** One PUT of a large recording to the presigned storage URL. */
export const HEYGEN_TWIN_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export type HeyGenTwinStatus =
  | 'processing'
  | 'pending_consent'
  | 'completed'
  | 'failed';
export type HeyGenConsentStatus = 'pending' | 'accepted' | 'rejected';

const errorSchema = z
  .object({
    code: z.string().nullish(),
    message: z.string().nullish(),
  })
  .nullish();

const wrap = <T extends z.ZodType>(item: T) => z.object({ data: item });

export const directUploadSchema = wrap(
  z.object({
    asset_id: z.string().trim().min(1),
    upload_headers: z.record(z.string(), z.string()).default({}),
    upload_url: z.string().trim().min(1),
  }),
);

export const assetCompleteSchema = wrap(
  z.object({
    asset_id: z.string().trim().min(1),
    status: z.string().nullish(),
  }),
);

const lookItemSchema = z.object({
  avatar_type: z.string().nullish(),
  default_voice_id: z.string().nullish(),
  error: errorSchema,
  group_id: z.string().nullish(),
  id: z.string().trim().min(1),
  preview_image_url: z.string().nullish(),
  status: z.string().nullish(),
  supported_api_engines: z.array(z.string()).nullish(),
});

const groupItemSchema = z.object({
  consent_status: z.string().nullish(),
  default_voice_id: z.string().nullish(),
  error: errorSchema,
  id: z.string().trim().min(1),
  looks_count: z.number().nullish(),
  status: z.string().nullish(),
});

export const twinCreateSchema = wrap(
  z.object({
    avatar_group: groupItemSchema,
    avatar_item: lookItemSchema,
  }),
);
export const twinLookSchema = wrap(lookItemSchema);
export const twinGroupSchema = wrap(groupItemSchema);
export const consentRequestSchema = wrap(
  z.object({
    avatar_group: groupItemSchema.nullish(),
    url: z.string().nullish(),
  }),
);

export interface HeyGenTwinLook {
  avatarType: string | null;
  defaultVoiceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  groupId: string | null;
  lookId: string;
  previewImageUrl: string | null;
  status: HeyGenTwinStatus;
  supportedEngines: string[];
}

export interface HeyGenTwinGroup {
  consentStatus: HeyGenConsentStatus | null;
  defaultVoiceId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  groupId: string;
  looksCount: number | null;
  status: HeyGenTwinStatus;
}

export interface HeyGenTwinCreated {
  group: HeyGenTwinGroup;
  look: HeyGenTwinLook;
}

export interface HeyGenConsentLink {
  /** Page on the provider's site where the person records the statement. */
  consentUrl: string;
  expiresAt: Date;
  group: HeyGenTwinGroup | null;
}

export interface HeyGenTwinDeleteResult {
  deleted: string[];
  failed: { reason: string; resource: string }[];
}

const KNOWN_STATUSES: readonly HeyGenTwinStatus[] = [
  'processing',
  'pending_consent',
  'completed',
  'failed',
];

/**
 * A missing status means the provider records none for this avatar. For a
 * twin that only happens before it is processed, so it reads as `processing`
 * rather than as ready.
 */
export function toTwinStatus(
  value: string | null | undefined,
): HeyGenTwinStatus {
  const status = value?.trim().toLowerCase();
  return KNOWN_STATUSES.find((known) => known === status) ?? 'processing';
}

export function toConsentStatus(
  value: string | null | undefined,
): HeyGenConsentStatus | null {
  const status = value?.trim().toLowerCase();
  return status === 'pending' || status === 'accepted' || status === 'rejected'
    ? status
    : null;
}

export function toTwinLook(
  item: z.infer<typeof lookItemSchema>,
): HeyGenTwinLook {
  return {
    avatarType: item.avatar_type ?? null,
    defaultVoiceId: item.default_voice_id ?? null,
    errorCode: item.error?.code ?? null,
    errorMessage: item.error?.message ?? null,
    groupId: item.group_id ?? null,
    lookId: item.id,
    previewImageUrl: item.preview_image_url ?? null,
    status: toTwinStatus(item.status),
    supportedEngines: item.supported_api_engines ?? [],
  };
}

export function toTwinGroup(
  item: z.infer<typeof groupItemSchema>,
): HeyGenTwinGroup {
  return {
    consentStatus: toConsentStatus(item.consent_status),
    defaultVoiceId: item.default_voice_id ?? null,
    errorCode: item.error?.code ?? null,
    errorMessage: item.error?.message ?? null,
    groupId: item.id,
    looksCount: item.looks_count ?? null,
    status: toTwinStatus(item.status),
  };
}

// Voice clone contracts: /docs/voices/heygen-voice-instant-clone.md,
// /reference/create-or-retrain-an-audio-voice and /reference/get-an-audio-voice
// (read 2026-11-08).

/** Inline (base64) audio the provider accepts for an instant clone. */
export const HEYGEN_VOICE_SAMPLE_CONTENT_TYPES = [
  'audio/wav',
  'audio/mpeg',
] as const;
/** Inline audio is capped at 16 MB after decoding. */
export const HEYGEN_VOICE_SAMPLE_MAX_BYTES = 16 * 1000 * 1000;
/** The provider names a voice with at most 64 characters. */
export const HEYGEN_VOICE_NAME_MAX_LENGTH = 64;

export type HeyGenVoiceStatus = 'pending' | 'active' | 'failed';

export interface HeyGenClonedVoice {
  failureReason: string | null;
  previewAudioUrl: string | null;
  status: HeyGenVoiceStatus;
  voiceId: string;
}

export const voiceCreateSchema = wrap(
  z.object({ voice_id: z.string().trim().min(1) }),
);

export const voiceSchema = wrap(
  z.object({
    failure_reason: z.string().nullish(),
    preview_audio_url: z.string().nullish(),
    status: z.string().trim().min(1),
    voice_id: z.string().trim().min(1),
  }),
);

export function toClonedVoice(
  voice: z.infer<typeof voiceSchema>['data'],
): HeyGenClonedVoice {
  const status = voice.status.toUpperCase();
  return {
    failureReason: voice.failure_reason ?? null,
    previewAudioUrl: voice.preview_audio_url ?? null,
    status:
      status === 'ACTIVE'
        ? 'active'
        : status === 'FAILED'
          ? 'failed'
          : 'pending',
    voiceId: voice.voice_id,
  };
}

/** Why the provider will not clone from this sample, or null when it can. */
export function voiceSampleProblem(input: {
  contentType: string;
  sizeBytes: number;
}): string | null {
  const contentType = input.contentType.split(';')[0]?.trim().toLowerCase();
  if (
    !HEYGEN_VOICE_SAMPLE_CONTENT_TYPES.some(
      (allowed) => allowed === contentType,
    )
  )
    return 'The voice sample must be a WAV or MP3 file.';
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0)
    return 'The voice sample is empty.';
  if (input.sizeBytes > HEYGEN_VOICE_SAMPLE_MAX_BYTES)
    return 'The voice sample is over 16 MB. Record a shorter sample.';
  return null;
}

/** A plain sentence for the reason the provider gives for a failed clone. */
export function describeVoiceCloneFailure(reason: string | null): string {
  switch (reason) {
    case 'INVALID_AUDIO':
    case 'INSUFFICIENT_AUDIO':
      return 'HeyGen could not use this sample. Record at least a minute of clear speech and try again.';
    case 'PREPROCESSING_FAILED':
      return 'HeyGen could not clean up this sample. Record again in a quieter room.';
    default:
      return 'HeyGen could not create the voice. Try again in a moment.';
  }
}

/** Why the provider will not train from this footage, or null when it can. */
export function footageProblem(input: {
  contentType: string;
  sizeBytes: number;
}): string | null {
  const contentType = input.contentType.split(';')[0]?.trim().toLowerCase();
  if (
    !HEYGEN_TWIN_FOOTAGE_CONTENT_TYPES.some(
      (allowed) => allowed === contentType,
    )
  )
    return 'Training footage must be an mp4, webm or mov video.';
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0)
    return 'Training footage is empty.';
  if (input.sizeBytes > HEYGEN_DIRECT_UPLOAD_VIDEO_MAX_BYTES)
    return 'Training footage is over the 200 MB limit. Record a shorter take.';
  return null;
}

/** Maps a failed provider response to the exception the caller should see. */
export function mapHeyGenTwinFailure(
  status: number,
  payload: unknown,
  headers: unknown,
): Error {
  const { code, param } = readHeyGenErrorEnvelope(payload);
  const message = readHeyGenErrorMessage(payload);
  const retryAfter = readHeyGenRetryAfter(headers);
  switch (status) {
    case 400:
      return new BadRequestException(
        message ??
          `HeyGen rejected the request (${code ?? 'invalid_parameter'}${
            param ? `: ${param}` : ''
          }).`,
      );
    case 401:
      // 401 from our own API signs the person out, so this stays a 400.
      return new BadRequestException(
        'HeyGen rejected the connected key. Reconnect your personal HeyGen account.',
      );
    case 402:
      return new HeyGenSubmissionRejectedError();
    case 403:
      return new ForbiddenException(
        message ?? 'This HeyGen account cannot do that.',
      );
    case 404:
      return new NotFoundException({
        message: message ?? 'The HeyGen resource was not found.',
      });
    case 409:
      return new ConflictException(
        code === 'request_in_progress'
          ? 'HeyGen is still handling this request. Try again shortly.'
          : (message ?? 'HeyGen could not accept this request right now.'),
      );
    case 429:
      return new HttpException(
        retryAfter === undefined
          ? 'HeyGen is rate limited.'
          : `HeyGen is rate limited. Retry after ${retryAfter} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    default:
      return status >= 500
        ? new ServiceUnavailableException('HeyGen is unavailable.')
        : new Error(`HeyGen returned status ${status}.`);
  }
}

function readHeyGenErrorMessage(payload: unknown): string | undefined {
  const error =
    payload && typeof payload === 'object'
      ? (payload as { error?: unknown }).error
      : undefined;
  if (!error || typeof error !== 'object') return undefined;
  const { message } = error as { message?: unknown };
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : undefined;
}
