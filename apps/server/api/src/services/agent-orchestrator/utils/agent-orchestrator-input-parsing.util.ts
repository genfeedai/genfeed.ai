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

function containsLineTerminator(
  value: string,
  start: number,
  end: number,
): boolean {
  for (let index = start; index < end; index += 1) {
    if (isLineTerminator(value[index])) {
      return true;
    }
  }

  return false;
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
    for (
      let styleIndex = index + 2;
      styleIndex < words.length;
      styleIndex += 1
    ) {
      const styleWord = words[styleIndex];
      if (styleWord.value !== 'style') {
        continue;
      }

      let notesEnd = styleWord.start;
      while (notesEnd > contentStart && isWhitespace(content[notesEnd - 1])) {
        notesEnd -= 1;
      }
      if (notesEnd === styleWord.start) {
        continue;
      }

      let notesStart = contentStart;
      while (notesStart < notesEnd && isWhitespace(content[notesStart])) {
        notesStart += 1;
      }
      if (containsLineTerminator(content, notesStart, notesEnd)) {
        continue;
      }

      const notes = content.slice(contentStart, notesEnd).trim();
      if (notes) {
        return notes;
      }
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

  for (const word of words) {
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
          nextWordStart < normalizedContent.length &&
          containsLineTerminator(normalizedContent, cursor, nextWordStart)
        ) {
          crossedUnsupportedLineBreak = true;
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
