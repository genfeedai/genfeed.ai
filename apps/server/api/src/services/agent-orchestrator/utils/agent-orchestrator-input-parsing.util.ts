interface WordSpan {
  end: number;
  start: number;
  value: string;
}

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

function isAsciiWordCharacter(character: string): boolean {
  const code = character.charCodeAt(0);

  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  );
}

function isWhitespace(character: string): boolean {
  return character.trim().length === 0;
}

function isLineTerminator(character: string): boolean {
  return (
    character === '\n' ||
    character === '\r' ||
    character === '\u2028' ||
    character === '\u2029'
  );
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

function collectWordSpans(value: string): WordSpan[] {
  const words: WordSpan[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (!isAsciiWordCharacter(value[cursor])) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    while (cursor < value.length && isAsciiWordCharacter(value[cursor])) {
      cursor += 1;
    }

    words.push({
      end: cursor,
      start,
      value: value.slice(start, cursor).toLowerCase(),
    });
  }

  return words;
}

function buildStyleWordIndexes(
  content: string,
  words: WordSpan[],
): {
  nextStyleIndex: Int32Array;
  notesEndByStyleIndex: Int32Array;
} {
  const nextStyleIndex = new Int32Array(words.length + 1);
  const notesEndByStyleIndex = new Int32Array(words.length);
  nextStyleIndex.fill(-1);
  notesEndByStyleIndex.fill(-1);
  let nextIndex = -1;

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    if (
      word.value === 'style' &&
      word.start > 0 &&
      isWhitespace(content[word.start - 1])
    ) {
      let notesEnd = word.start;
      while (notesEnd > 0 && isWhitespace(content[notesEnd - 1])) {
        notesEnd -= 1;
      }
      notesEndByStyleIndex[index] = notesEnd;
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
    const code = character.charCodeAt(0);
    if (code < 48 || code > 57) {
      return false;
    }
  }

  return true;
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

    let assetIndex = index + 1;
    if (
      !containsOnlyWhitespace(content, countWord.end, words[assetIndex].start)
    ) {
      continue;
    }

    if (RECURRING_PLATFORMS.has(words[assetIndex].value)) {
      assetIndex += 1;
      if (
        assetIndex >= words.length ||
        !containsOnlyWhitespace(
          content,
          words[assetIndex - 1].end,
          words[assetIndex].start,
        )
      ) {
        continue;
      }
    }

    if (RECURRING_ASSETS.has(words[assetIndex].value)) {
      return Number.parseInt(countWord.value, 10);
    }
  }

  return undefined;
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
    if (
      (preposition.value !== 'in' && preposition.value !== 'with') ||
      (article.value !== 'a' && article.value !== 'an') ||
      !containsOnlyWhitespace(content, preposition.end, article.start) ||
      !containsOnlyWhitespace(content, article.end, words[index + 2].start)
    ) {
      continue;
    }

    const contentStart = article.end;
    const notesStart = words[index + 2].start;
    let styleIndex = nextStyleIndex[index + 2];
    if (styleIndex < 0) {
      return undefined;
    }

    let notesEnd = notesEndByStyleIndex[styleIndex];
    if (notesEnd <= notesStart) {
      styleIndex = nextStyleIndex[styleIndex + 1];
      if (styleIndex < 0) {
        continue;
      }
      notesEnd = notesEndByStyleIndex[styleIndex];
    }

    if (
      notesEnd > notesStart &&
      !containsLineTerminator(lineTerminatorPrefix, notesStart, notesEnd)
    ) {
      return content.slice(contentStart, notesEnd).trim();
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

export function extractBatchTopic(
  originalContent: string,
  normalizedContent: string,
): string | undefined {
  const words = collectWordSpans(normalizedContent);
  const lineTerminatorPrefix = buildLineTerminatorPrefix(normalizedContent);

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    if (word.value !== 'about' || word.end >= normalizedContent.length) {
      continue;
    }

    let topicStart = word.end;
    while (
      topicStart < normalizedContent.length &&
      isWhitespace(normalizedContent[topicStart])
    ) {
      topicStart += 1;
    }

    if (topicStart === word.end) {
      continue;
    }

    let cursor = topicStart;
    let crossedUnsupportedLineBreak = false;
    while (cursor < normalizedContent.length) {
      const character = normalizedContent[cursor];
      if (character === '.' || character === '!' || character === '?') {
        break;
      }

      if (isWhitespace(character)) {
        let nextWordStart = cursor;
        while (
          nextWordStart < normalizedContent.length &&
          isWhitespace(normalizedContent[nextWordStart])
        ) {
          nextWordStart += 1;
        }

        if (startsWithTerminator(normalizedContent, nextWordStart)) {
          break;
        }

        if (
          containsLineTerminator(lineTerminatorPrefix, cursor, nextWordStart)
        ) {
          crossedUnsupportedLineBreak = true;
          while (
            wordIndex + 1 < words.length &&
            words[wordIndex + 1].start < nextWordStart
          ) {
            wordIndex += 1;
          }
          break;
        }

        cursor = nextWordStart;
        continue;
      }

      cursor += 1;
    }

    if (crossedUnsupportedLineBreak) {
      continue;
    }

    const topic = originalContent.slice(topicStart, cursor).trim();
    if (topic) {
      return topic;
    }
  }

  return undefined;
}
