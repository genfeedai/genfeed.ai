/**
 * Speaking rate behind the admission estimate: about 120 words a minute. HeyGen
 * publishes no rate, so this is ours. It errs slow on purpose, so the hold
 * usually covers the clip and settlement refunds the difference; a faster
 * delivery is topped up at settlement rather than under-held.
 */
export const AVATAR_SPEECH_CHARACTERS_PER_SECOND = 12;

/**
 * Estimated clip seconds for a script, counted in Unicode code points like the
 * HeyGen speech meter. Whole seconds, never below one.
 */
export function estimateAvatarSpeechSeconds(script: string): number {
  const characters = Array.from(script.trim()).length;
  return Math.max(
    1,
    Math.ceil(characters / AVATAR_SPEECH_CHARACTERS_PER_SECOND),
  );
}

/** A positive, finite second count, or undefined. */
export function readAvatarDurationSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
