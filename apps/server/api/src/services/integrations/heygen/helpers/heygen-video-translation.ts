import { HEYGEN_API_ORIGIN } from '@api/services/integrations/heygen/helpers/heygen-video';

/**
 * HeyGen Video Translation: a source video dubbed into one or more languages.
 * Endpoints and the two required fields (`video`, `output_languages`) come
 * from HeyGen's public API reference (`POST /v3/video-translations`,
 * `GET /v3/video-translations/{id}`, `GET /v3/video-translations/languages`).
 * The reference does not state a price (translation bills on the source
 * duration), the presigned-URL expiry, the shape of the finished outputs or a
 * language limit. Sending the source as `{ type: 'url', url }` follows the
 * other v3 endpoints and is unverified until a paid test run.
 */
export const HEYGEN_VIDEO_TRANSLATION_PATH = '/v3/video-translations';
export const HEYGEN_VIDEO_TRANSLATION_POLL_INTERVAL_MS = 10_000;
export const HEYGEN_VIDEO_TRANSLATION_POLL_TIMEOUT_MS = 1_800_000;

const TERMINAL_STATUSES = ['completed', 'failed'];

export interface HeyGenVideoTranslationBody {
  output_languages: string[];
  video: { type: 'url'; url: string };
}

export interface HeyGenTranslatedVideo {
  language: string;
  videoUrl: string;
}

export interface HeyGenVideoTranslationStatus {
  failureMessage?: string;
  outputs: HeyGenTranslatedVideo[];
  status: string;
}

export function buildHeyGenVideoTranslationBody(input: {
  languages: readonly string[];
  videoUrl: string;
}): HeyGenVideoTranslationBody {
  const url = input.videoUrl.trim();
  if (!url.startsWith('https://')) {
    throw new Error('HeyGen Video Translation needs an https video URL.');
  }
  const languages = [
    ...new Set(input.languages.map((language) => language.trim())),
  ].filter(Boolean);
  if (languages.length === 0) {
    throw new Error('HeyGen Video Translation needs at least one language.');
  }
  return { output_languages: languages, video: { type: 'url', url } };
}

export function heyGenVideoTranslationStatusUrl(id: string): string {
  return `${HEYGEN_API_ORIGIN}${HEYGEN_VIDEO_TRANSLATION_PATH}/${encodeURIComponent(id)}`;
}

function readData(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const data = (payload as { data?: unknown }).data;
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readHeyGenVideoTranslationId(
  payload: unknown,
): string | undefined {
  const data = readData(payload);
  return readText(data?.video_translation_id) ?? readText(data?.id);
}

export function readHeyGenVideoTranslationStatus(
  payload: unknown,
): HeyGenVideoTranslationStatus {
  const data = readData(payload);
  const failureMessage = readText(data?.failure_message);
  const rawOutputs: unknown[] = Array.isArray(data?.outputs)
    ? data.outputs
    : [];
  const outputs = rawOutputs.flatMap((entry): HeyGenTranslatedVideo[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as { language?: unknown; video_url?: unknown };
    const language = readText(record.language);
    const videoUrl = readText(record.video_url);
    return language && videoUrl?.startsWith('https://')
      ? [{ language, videoUrl }]
      : [];
  });
  return {
    ...(failureMessage ? { failureMessage } : {}),
    outputs,
    status: readText(data?.status) ?? 'pending',
  };
}

export function isHeyGenVideoTranslationTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}
