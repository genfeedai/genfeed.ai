/** Highlight-relative caption generation for deterministic raw-cut clips. */

const CAPTION_VISUAL_LEAD_SECONDS = 0.04;
const CAPTION_VISUAL_TAIL_SECONDS = 0.12;
const MAX_CAPTION_PHRASE_WORDS = 6;

export interface TranscriptWord {
  end: number;
  start: number;
  word: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

interface CaptionPhrase {
  end: number;
  start: number;
  text: string;
}

export function isTranscriptSegment(
  value: unknown,
): value is TranscriptSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const segment = value as Record<string, unknown>;

  return (
    typeof segment.start === 'number' &&
    typeof segment.end === 'number' &&
    typeof segment.text === 'string' &&
    (segment.words === undefined ||
      (Array.isArray(segment.words) && segment.words.every(isTranscriptWord)))
  );
}

function isTranscriptWord(value: unknown): value is TranscriptWord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const word = value as Record<string, unknown>;
  return (
    typeof word.start === 'number' &&
    typeof word.end === 'number' &&
    typeof word.word === 'string'
  );
}

/**
 * Builds a one-line, short-phrase SRT track for a source window. Exact word
 * timestamps are preferred. Legacy segment-only transcripts are deterministically
 * interpolated so old projects gain the same phrase/cue contract.
 */
export function generateClipSrt(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
): string {
  const phrases = segments
    .flatMap((segment) => {
      const words = segmentToWords(segment)
        .filter((word) => word.end > clipStart && word.start < clipEnd)
        .map((word) => ({
          ...word,
          end: Math.min(word.end, clipEnd),
          start: Math.max(word.start, clipStart),
        }))
        .filter((word) => word.end > word.start)
        .sort((left, right) => left.start - right.start);
      return wordsToPhrases(words);
    })
    .sort((left, right) => left.start - right.start);

  return phrases
    .map((phrase, index) => {
      const previousEnd = index > 0 ? phrases[index - 1]?.end : undefined;
      const nextStart = phrases[index + 1]?.start;
      const cueStart = Math.max(
        clipStart,
        previousEnd === undefined ? clipStart : previousEnd,
        phrase.start - CAPTION_VISUAL_LEAD_SECONDS,
      );
      const cueEnd = Math.min(
        clipEnd,
        nextStart ?? clipEnd,
        phrase.end + CAPTION_VISUAL_TAIL_SECONDS,
      );
      return `${index + 1}\n${formatSrtTimestamp(cueStart - clipStart)} --> ${formatSrtTimestamp(cueEnd - clipStart)}\n${phrase.text}`;
    })
    .join('\n\n');
}

function segmentToWords(segment: TranscriptSegment): TranscriptWord[] {
  const exactWords = segment.words?.filter(isTranscriptWord) ?? [];
  if (exactWords.length > 0) {
    return exactWords;
  }

  const tokens = segment.text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || segment.end <= segment.start) {
    return [];
  }
  const wordDuration = (segment.end - segment.start) / tokens.length;
  return tokens.map((word, index) => ({
    end: segment.start + wordDuration * (index + 1),
    start: segment.start + wordDuration * index,
    word,
  }));
}

function wordsToPhrases(words: TranscriptWord[]): CaptionPhrase[] {
  const phrases: CaptionPhrase[] = [];
  let phraseWords: TranscriptWord[] = [];

  const flush = () => {
    const first = phraseWords[0];
    const last = phraseWords[phraseWords.length - 1];
    if (first && last) {
      phrases.push({
        end: last.end,
        start: first.start,
        text: phraseWords.map((word) => word.word.trim()).join(' '),
      });
    }
    phraseWords = [];
  };

  for (const word of words) {
    phraseWords.push(word);
    if (
      phraseWords.length >= MAX_CAPTION_PHRASE_WORDS ||
      /[.!?,;:]$/.test(word.word.trim())
    ) {
      flush();
    }
  }
  flush();
  return phrases;
}

/** Formats a duration in seconds as an `HH:MM:SS,mmm` SRT timestamp. */
export function formatSrtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const mins = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const ms = totalMilliseconds % 1000;

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
