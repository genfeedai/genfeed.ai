import {
  isAsciiDigitCode,
  isAsciiWordCharacter,
} from '@api/shared/utils/string/linear-string.util';

type WordSpan = {
  end: number;
  start: number;
  value: string;
};

type StyleWordIndexes = {
  nextStyleIndex: Int32Array;
  notesEndByStyleIndex: Int32Array;
};

type TopicBoundary = {
  crossedUnsupportedLineBreak: boolean;
  cursor: number;
  wordIndex: number;
};

const RECURRING_PLATFORMS = new Set([
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'twitter',
  'x',
]);
const RECURRING_ASSETS = new Set([
  'image',
  'images',
  'newsletter',
  'newsletters',
  'post',
  'posts',
  'video',
  'videos',
]);
const BATCH_TOPIC_TERMINATORS = ['for', 'on', 'this', 'next', 'over'];
const LINE_TERMINATORS = new Set(['\n', '\r', '\u2028', '\u2029']);

function isWhitespace(character: string): boolean {
  return character.trim().length === 0;
}

function isLineTerminator(character: string): boolean {
  return LINE_TERMINATORS.has(character);
}

function buildLineTerminatorPrefix(value: string): Uint32Array {
  const prefix = new Uint32Array(value.length + 1);

  for (let index = 0; index < value.length; index += 1) {
    prefix[index + 1] = prefix[index] + Number(isLineTerminator(value[index]));
  }

  return prefix;
}

function containsLineTerminator(
  prefix: Uint32Array,
  start: number,
  end: number,
): boolean {
  return prefix[end] > prefix[start];
}

function containsOnlyWhitespace(
  value: string,
  start: number,
  end: number,
): boolean {
  if (start >= end) {
    return false;
  }

  for (let index = start; index < end; index += 1) {
    if (!isWhitespace(value[index])) {
      return false;
    }
  }

  return true;
}

function skipNonWordCharacters(value: string, cursor: number): number {
  while (cursor < value.length && !isAsciiWordCharacter(value[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function readWordEnd(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length && isAsciiWordCharacter(value[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function collectWordSpans(value: string): WordSpan[] {
  const words: WordSpan[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    cursor = skipNonWordCharacters(value, cursor);
    if (cursor >= value.length) {
      break;
    }

    const start = cursor;
    cursor = readWordEnd(value, start);
    words.push({
      end: cursor,
      start,
      value: value.slice(start, cursor).toLowerCase(),
    });
  }

  return words;
}

function isSpacedStyleWord(content: string, word: WordSpan): boolean {
  return (
    word.value === 'style' &&
    word.start > 0 &&
    isWhitespace(content[word.start - 1])
  );
}

function trimTrailingWhitespace(content: string, end: number): number {
  while (end > 0 && isWhitespace(content[end - 1])) {
    end -= 1;
  }

  return end;
}

function buildStyleWordIndexes(
  content: string,
  words: WordSpan[],
): StyleWordIndexes {
  const nextStyleIndex = new Int32Array(words.length + 1);
  const notesEndByStyleIndex = new Int32Array(words.length);
  nextStyleIndex.fill(-1);
  notesEndByStyleIndex.fill(-1);
  let nextIndex = -1;

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    if (isSpacedStyleWord(content, word)) {
      notesEndByStyleIndex[index] = trimTrailingWhitespace(content, word.start);
      nextIndex = index;
    }

    nextStyleIndex[index] = nextIndex;
  }

  return { nextStyleIndex, notesEndByStyleIndex };
}

function isOneOrTwoDigits(value: string): boolean {
  if (value.length < 1 || value.length > 2) {
    return false;
  }

  for (const character of value) {
    if (!isAsciiDigitCode(character.charCodeAt(0))) {
      return false;
    }
  }

  return true;
}

function skipOptionalPlatformAsset(
  content: string,
  words: WordSpan[],
  assetIndex: number,
): number | undefined {
  if (!RECURRING_PLATFORMS.has(words[assetIndex].value)) {
    return assetIndex;
  }

  const nextIndex = assetIndex + 1;
  if (
    nextIndex >= words.length ||
    !containsOnlyWhitespace(
      content,
      words[assetIndex].end,
      words[nextIndex].start,
    )
  ) {
    return undefined;
  }

  return nextIndex;
}

export function extractRecurringContentCount(
  content: string,
): number | undefined {
  const words = collectWordSpans(content);

  for (let index = 0; index < words.length - 1; index += 1) {
    const countWord = words[index];
    if (!isOneOrTwoDigits(countWord.value)) {
      continue;
    }

    if (
      !containsOnlyWhitespace(content, countWord.end, words[index + 1].start)
    ) {
      continue;
    }

    const assetIndex = skipOptionalPlatformAsset(content, words, index + 1);
    if (
      assetIndex !== undefined &&
      RECURRING_ASSETS.has(words[assetIndex].value)
    ) {
      return Number.parseInt(countWord.value, 10);
    }
  }

  return undefined;
}

function isStylePreposition(value: string): boolean {
  return value === 'in' || value === 'with';
}

function isStyleArticle(value: string): boolean {
  return value === 'a' || value === 'an';
}

function isStyleCue(
  content: string,
  preposition: WordSpan,
  article: WordSpan,
  nextWord: WordSpan,
): boolean {
  return (
    isStylePreposition(preposition.value) &&
    isStyleArticle(article.value) &&
    containsOnlyWhitespace(content, preposition.end, article.start) &&
    containsOnlyWhitespace(content, article.end, nextWord.start)
  );
}

function resolveStyleNotesEnd(
  nextStyleIndex: Int32Array,
  notesEndByStyleIndex: Int32Array,
  startWordIndex: number,
  notesStart: number,
): number | undefined {
  let styleIndex = nextStyleIndex[startWordIndex];
  if (styleIndex < 0) {
    return undefined;
  }

  let notesEnd = notesEndByStyleIndex[styleIndex];
  if (notesEnd <= notesStart) {
    styleIndex = nextStyleIndex[styleIndex + 1];
    if (styleIndex < 0) {
      return undefined;
    }
    notesEnd = notesEndByStyleIndex[styleIndex];
  }

  return notesEnd > notesStart ? notesEnd : undefined;
}

export function extractStyleNotes(content: string): string | undefined {
  const words = collectWordSpans(content);
  const lineTerminatorPrefix = buildLineTerminatorPrefix(content);
  const { nextStyleIndex, notesEndByStyleIndex } = buildStyleWordIndexes(
    content,
    words,
  );

  for (let index = 0; index < words.length - 2; index += 1) {
    const preposition = words[index];
    const article = words[index + 1];
    const nextWord = words[index + 2];
    if (!isStyleCue(content, preposition, article, nextWord)) {
      continue;
    }

    const notesStart = nextWord.start;
    const notesEnd = resolveStyleNotesEnd(
      nextStyleIndex,
      notesEndByStyleIndex,
      index + 2,
      notesStart,
    );
    if (notesEnd === undefined) {
      if (nextStyleIndex[index + 2] < 0) {
        return undefined;
      }
      continue;
    }

    if (!containsLineTerminator(lineTerminatorPrefix, notesStart, notesEnd)) {
      return content.slice(article.end, notesEnd).trim();
    }
  }

  return undefined;
}

function startsWithTerminator(value: string, start: number): boolean {
  return BATCH_TOPIC_TERMINATORS.some((terminator) => {
    if (!value.startsWith(terminator, start)) {
      return false;
    }

    const end = start + terminator.length;
    return end >= value.length || !isAsciiWordCharacter(value[end]);
  });
}

function skipWhitespace(value: string, start: number): number {
  let cursor = start;
  while (cursor < value.length && isWhitespace(value[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function isSentencePunctuation(character: string): boolean {
  return character === '.' || character === '!' || character === '?';
}

function isAboutWord(word: WordSpan, contentLength: number): boolean {
  return word.value === 'about' && word.end < contentLength;
}

function findTopicStart(
  normalizedContent: string,
  aboutEnd: number,
): number | undefined {
  const topicStart = skipWhitespace(normalizedContent, aboutEnd);
  if (topicStart === aboutEnd) {
    return undefined;
  }

  return topicStart;
}

function skipWordsBefore(
  words: WordSpan[],
  wordIndex: number,
  limit: number,
): number {
  while (wordIndex + 1 < words.length && words[wordIndex + 1].start < limit) {
    wordIndex += 1;
  }

  return wordIndex;
}

function completedTopic(
  originalContent: string,
  topicStart: number,
  boundary: TopicBoundary,
): string | undefined {
  if (boundary.crossedUnsupportedLineBreak) {
    return undefined;
  }

  const topic = originalContent.slice(topicStart, boundary.cursor).trim();
  return topic || undefined;
}

function resolveWhitespaceGap(
  normalizedContent: string,
  lineTerminatorPrefix: Uint32Array,
  words: WordSpan[],
  cursor: number,
  wordIndex: number,
):
  | { kind: 'stop'; boundary: TopicBoundary }
  | { kind: 'continue'; cursor: number } {
  const nextWordStart = skipWhitespace(normalizedContent, cursor);
  if (startsWithTerminator(normalizedContent, nextWordStart)) {
    return {
      kind: 'stop',
      boundary: {
        crossedUnsupportedLineBreak: false,
        cursor,
        wordIndex,
      },
    };
  }

  if (containsLineTerminator(lineTerminatorPrefix, cursor, nextWordStart)) {
    return {
      kind: 'stop',
      boundary: {
        crossedUnsupportedLineBreak: true,
        cursor,
        wordIndex: skipWordsBefore(words, wordIndex, nextWordStart),
      },
    };
  }

  return { kind: 'continue', cursor: nextWordStart };
}

function scanTopicBoundary(
  normalizedContent: string,
  lineTerminatorPrefix: Uint32Array,
  words: WordSpan[],
  topicStart: number,
  wordIndex: number,
): TopicBoundary {
  let cursor = topicStart;

  while (cursor < normalizedContent.length) {
    const character = normalizedContent[cursor];
    if (isSentencePunctuation(character)) {
      return {
        crossedUnsupportedLineBreak: false,
        cursor,
        wordIndex,
      };
    }

    if (!isWhitespace(character)) {
      cursor += 1;
      continue;
    }

    const gap = resolveWhitespaceGap(
      normalizedContent,
      lineTerminatorPrefix,
      words,
      cursor,
      wordIndex,
    );
    if (gap.kind === 'stop') {
      return gap.boundary;
    }

    cursor = gap.cursor;
  }

  return {
    crossedUnsupportedLineBreak: false,
    cursor,
    wordIndex,
  };
}

export function extractBatchTopic(
  originalContent: string,
  normalizedContent: string,
): string | undefined {
  const words = collectWordSpans(normalizedContent);
  const lineTerminatorPrefix = buildLineTerminatorPrefix(normalizedContent);

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    if (!isAboutWord(word, normalizedContent.length)) {
      continue;
    }

    const topicStart = findTopicStart(normalizedContent, word.end);
    if (topicStart === undefined) {
      continue;
    }

    const boundary = scanTopicBoundary(
      normalizedContent,
      lineTerminatorPrefix,
      words,
      topicStart,
      wordIndex,
    );
    wordIndex = boundary.wordIndex;

    const topic = completedTopic(originalContent, topicStart, boundary);
    if (topic) {
      return topic;
    }
  }

  return undefined;
}
