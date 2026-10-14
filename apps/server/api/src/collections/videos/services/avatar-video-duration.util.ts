/**
 * Speaking rate behind the admission estimate for alphabetic and other
 * scripts: about 120 words a minute. HeyGen publishes no rate, so this is
 * ours. It errs slow on purpose, so the hold usually covers the clip and
 * settlement refunds the difference; a faster delivery is topped up at
 * settlement rather than under-held.
 */
export const AVATAR_SPEECH_CHARACTERS_PER_SECOND = 12;

/**
 * Speaking rate for Han, kana and Hangul, where a code point is about a
 * syllable rather than a letter. Read-speech measurements put Mandarin at
 * about 5.2 syllables a second and Japanese at about 7.8 morae a second
 * (Pellegrino, Coupé and Marsico, 2011); a kanji is often two morae, so mixed
 * Japanese text runs nearer five characters a second, and a Hangul block is
 * one syllable. Five a second is at or below those rates, so like the
 * alphabetic rate it errs toward a longer hold. Reading these scripts at the
 * alphabetic rate would under-hold them by more than half.
 */
export const AVATAR_SYLLABIC_CHARACTERS_PER_SECOND = 5;

const SYLLABIC_SCRIPT =
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;

/**
 * Time per code point in sixtieths of a second (60 is a common multiple of
 * both rates), so a mixed script sums exactly.
 */
const TICKS_PER_SECOND = 60;
const ALPHABETIC_TICKS = TICKS_PER_SECOND / AVATAR_SPEECH_CHARACTERS_PER_SECOND;
const SYLLABIC_TICKS = TICKS_PER_SECOND / AVATAR_SYLLABIC_CHARACTERS_PER_SECOND;

/**
 * Estimated clip seconds for a script, counted in Unicode code points like the
 * HeyGen speech meter. Each character takes the time of its own script, so a
 * mixed script sums per character. Whole seconds, never below one.
 */
export function estimateAvatarSpeechSeconds(script: string): number {
  let ticks = 0;
  for (const character of script.trim())
    ticks += SYLLABIC_SCRIPT.test(character)
      ? SYLLABIC_TICKS
      : ALPHABETIC_TICKS;
  return Math.max(1, Math.ceil(ticks / TICKS_PER_SECOND));
}

/** A positive, finite second count, or undefined. */
export function readAvatarDurationSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
