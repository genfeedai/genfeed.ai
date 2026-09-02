import * as cheerio from 'cheerio';

/** Strip HTML tags and collapse whitespace into plain text. */
export function stripHtmlToText(html: string): string {
  if (!html) {
    return '';
  }
  // cheerio gives accurate text extraction; fall back to regex if parse fails.
  try {
    return cheerio.load(html).root().text().replace(/\s+/g, ' ').trim();
  } catch {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/** Count words in plain text. */
export function countWords(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

/** Split plain text into sentences. */
export function splitSentences(text: string): string[] {
  if (!text) {
    return [];
  }
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[a-z0-9]/i.test(sentence));
}

/** Estimate syllables in a single word (heuristic, English). */
export function countSyllablesInWord(word: string): number {
  const normalised = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalised) {
    return 0;
  }
  if (normalised.length <= 3) {
    return 1;
  }
  const groups = normalised
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

/**
 * Flesch Reading Ease (0-100, higher = easier).
 * `206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)`.
 *
 * NOTE: the only existing implementation lives in the frontend-only
 * `@genfeedai/services` package (a private class behind a Bearer-token
 * factory, with no tsconfig alias inside the NestJS API), so it cannot be
 * imported here. We re-implement the same canonical formula deterministically.
 */
export function fleschReadingEase(text: string): number {
  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) {
    return 0;
  }
  const syllables = words.reduce(
    (total, word) => total + countSyllablesInWord(word),
    0,
  );
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const score =
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/**
 * Keyword density as a word-coverage percentage:
 * `(occurrences × phrase_word_count) / total_words × 100`.
 * For a single-word keyword this is the usual occurrences/total*100; for a
 * multi-word phrase it reflects the share of words the phrase occupies.
 * Returns null when no keyword is supplied.
 */
export function computeKeywordDensity(
  text: string,
  keyword?: string | null,
): number | null {
  const normalisedKeyword = (keyword ?? '').trim().toLowerCase();
  if (!normalisedKeyword) {
    return null;
  }
  const totalWords = countWords(text);
  if (totalWords === 0) {
    return 0;
  }
  const escaped = normalisedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.toLowerCase().match(new RegExp(`\\b${escaped}\\b`, 'g'));
  const occurrences = matches ? matches.length : 0;
  const keywordWordSpan = normalisedKeyword.split(/\s+/).filter(Boolean).length;
  return (
    Math.round(((occurrences * keywordWordSpan) / totalWords) * 10000) / 100
  );
}
