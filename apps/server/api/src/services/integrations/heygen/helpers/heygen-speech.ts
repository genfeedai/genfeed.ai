import { HEYGEN_API_ORIGIN } from '@api/services/integrations/heygen/helpers/heygen-video';
import type {
  HeyGenSpeechBody,
  HeyGenSpeechInput,
  HeyGenSpeechResult,
} from '@api/services/integrations/heygen/heygen-speech.types';

/** HeyGen Voice speaks through the synchronous text-to-speech model endpoint. */
export const HEYGEN_SPEECH_PATH = '/v3/models/audio/tts';
export const HEYGEN_SPEECH_URL = `${HEYGEN_API_ORIGIN}${HEYGEN_SPEECH_PATH}`;

/**
 * The only model id we send. The pricing page also lists a `heygen-voice-1-turbo`
 * id that the API reference never mentions, so it is not offered.
 */
export const HEYGEN_SPEECH_MODEL_ID: HeyGenSpeechBody['model'] =
  'heygen-voice-1';

/** Documented request limit: 1 to 5,000 characters per call. */
export const HEYGEN_SPEECH_TEXT_MAX = 5_000;

/**
 * The docs say the request stays open until the file is assembled but give no
 * ceiling, so this bound is ours, not HeyGen's.
 */
export const HEYGEN_SPEECH_TIMEOUT_MS = 120_000;

/** Responses HeyGen documents as "did not complete and is safe to retry". */
export const HEYGEN_SPEECH_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  502, 503, 504,
]);
export const HEYGEN_SPEECH_MAX_ATTEMPTS = 3;
export const HEYGEN_SPEECH_RETRY_BASE_DELAY_MS = 1_000;

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * Billable characters: HeyGen charges per submitted Unicode character,
 * spaces and punctuation included. Counting code points (not UTF-16 units)
 * keeps emoji and astral characters at one each, the way the docs describe.
 */
export function countHeyGenSpeechCharacters(text: string): number {
  return Array.from(text).length;
}

/**
 * Builds the strict TTS body. The text is sent exactly as given, untrimmed, so
 * the characters we quote are the characters HeyGen bills.
 */
export function buildHeyGenSpeechBody(
  input: HeyGenSpeechInput,
): HeyGenSpeechBody {
  const voiceId = input.voiceId.trim();
  if (!voiceId) throw new Error('HeyGen Voice requires a voice id.');
  if (!input.text.trim()) throw new Error('HeyGen Voice requires text.');
  const characters = countHeyGenSpeechCharacters(input.text);
  if (characters > HEYGEN_SPEECH_TEXT_MAX)
    throw new Error(
      `HeyGen Voice accepts at most ${HEYGEN_SPEECH_TEXT_MAX} characters per request.`,
    );
  const language = input.language?.trim();
  if (language && !LANGUAGE_TAG.test(language))
    throw new Error('HeyGen Voice language must be a language code like en.');
  const boost = input.expressivenessBoost;
  if (
    boost !== undefined &&
    (!Number.isFinite(boost) || boost < 0 || boost > 1)
  )
    throw new Error('HeyGen Voice expressiveness must be between 0 and 1.');
  return {
    model: HEYGEN_SPEECH_MODEL_ID,
    text: input.text,
    voice_id: voiceId,
    ...(language ? { language } : {}),
    ...(boost === undefined ? {} : { expressiveness_boost: boost }),
  };
}

/**
 * Reads `{ data: { audio_url, duration } }`. Only an https `audio_url` is
 * accepted. `duration` is optional in practice, so a missing or invalid value
 * is left out rather than guessed.
 */
export function readHeyGenSpeech(
  payload: unknown,
  characters: number,
): HeyGenSpeechResult {
  const data =
    payload && typeof payload === 'object'
      ? (payload as { data?: unknown }).data
      : undefined;
  const record =
    data && typeof data === 'object'
      ? (data as { audio_url?: unknown; duration?: unknown })
      : {};
  const audioUrl =
    typeof record.audio_url === 'string' ? record.audio_url.trim() : '';
  if (!audioUrl.startsWith('https://'))
    throw new Error('HeyGen Voice returned no https audio url.');
  const duration =
    typeof record.duration === 'number' &&
    Number.isFinite(record.duration) &&
    record.duration >= 0
      ? record.duration
      : undefined;
  return {
    audioUrl,
    characters,
    ...(duration === undefined ? {} : { duration }),
  };
}

/** Machine-readable error fields from HeyGen's `{ error: { code, param } }` envelope. */
export function readHeyGenErrorEnvelope(payload: unknown): {
  code?: string;
  param?: string;
} {
  const error =
    payload && typeof payload === 'object'
      ? (payload as { error?: unknown }).error
      : undefined;
  if (!error || typeof error !== 'object') return {};
  const { code, param } = error as { code?: unknown; param?: unknown };
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof param === 'string' ? { param } : {}),
  };
}

/** Seconds from a `Retry-After` header, when it is a non-negative whole number. */
export function readHeyGenRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const entry = Object.entries(headers as Record<string, unknown>).find(
    ([name]) => name.toLowerCase() === 'retry-after',
  );
  const value = Number(entry?.[1]);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}
