import type { TranscriptSegment } from './clip-srt.util';

/**
 * The words the speaker said inside a highlight window, tightened for an
 * avatar to say them. Nothing is written or paraphrased: the cut only drops
 * what a viewer does not miss (fillers, stutters, a sentence said twice in a
 * row), so the avatar still speaks the creator's own words.
 */

const FILLER_WORDS = new Set(['er', 'erm', 'hmm', 'mm', 'uh', 'uhm', 'um']);

/** Words a speaker stutters on ("the the", "I I"); "had had" is left alone. */
const STUTTER_WORDS = new Set([
  'a',
  'an',
  'and',
  'but',
  'i',
  'in',
  'is',
  'it',
  'my',
  'of',
  'so',
  'the',
  'to',
  'we',
  'you',
]);

function bareWord(token: string): string {
  return token.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
}

function normalizeSentence(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tightenSentence(text: string): string {
  const kept: string[] = [];
  for (const token of text.split(/\s+/)) {
    const word = bareWord(token);
    if (!word) {
      if (token) kept.push(token);
      continue;
    }
    if (FILLER_WORDS.has(word)) continue;
    const previous = kept.length > 0 ? bareWord(kept[kept.length - 1]) : '';
    if (STUTTER_WORDS.has(word) && previous === word) continue;
    kept.push(token);
  }
  return kept
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/^[,;:\s]+/, '')
    .replace(/([,;:])(?=\s*[.!?]|$)/g, '')
    .trim()
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

function textInsideWindow(
  segment: TranscriptSegment,
  startTime: number,
  endTime: number,
): string {
  if (segment.words && segment.words.length > 0) {
    return segment.words
      .filter((word) => {
        const middle = (word.start + word.end) / 2;
        return middle >= startTime && middle <= endTime;
      })
      .map((word) => word.word.trim())
      .filter(Boolean)
      .join(' ');
  }
  const middle = (segment.start + segment.end) / 2;
  return middle >= startTime && middle <= endTime ? segment.text : '';
}

/**
 * Returns the tightened transcript of `[startTime, endTime]`, or an empty
 * string when nothing was said in the window.
 */
export function buildSpokenScript(
  segments: readonly TranscriptSegment[],
  startTime: number,
  endTime: number,
): string {
  const sentences: string[] = [];
  let previousKey = '';
  for (const segment of segments) {
    if (segment.end < startTime || segment.start > endTime) continue;
    const sentence = tightenSentence(
      textInsideWindow(segment, startTime, endTime).trim(),
    );
    if (!sentence) continue;
    const key = normalizeSentence(sentence);
    if (key && key === previousKey) continue;
    previousKey = key;
    sentences.push(sentence);
  }
  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}
