import type { AccountPublishingContext } from '@genfeedai/interfaces';
import { parseTweet } from 'twitter-text';

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function isValidPostLength(
  postHtml: string,
  maxLength: number,
  usesWeightedCharacters: boolean,
): boolean {
  const textOnly = stripHtmlTags(postHtml);
  const length = usesWeightedCharacters
    ? parseTweet(textOnly).weightedLength
    : textOnly.length;

  return textOnly.length > 0 && length <= maxLength;
}

/**
 * Parse model output into bounded post text while honoring the selected
 * account's character-counting contract.
 */
export function parsePostGenerationContent(
  content: string,
  maxCount: number,
  context?: Pick<AccountPublishingContext, 'constraints'>,
): string[] {
  const { cleanPost, isValid } = createPostGenerationParser(context);
  const candidates = extractPostGenerationCandidates(
    content,
    cleanPost,
    isValid,
  );

  return candidates
    .filter((post): post is string => typeof post === 'string')
    .map(cleanPost)
    .filter((post) => post.length > 0 && isValid(post))
    .slice(0, maxCount);
}

/**
 * Parse model output without collapsing invalid positions. Thread generation
 * uses this so a rejected middle reply cannot shift later replies to the wrong
 * child post.
 */
export function parsePostGenerationSlots(
  content: string,
  maxCount: number,
  context?: Pick<AccountPublishingContext, 'constraints'>,
): Array<string | null> {
  const { cleanPost, isValid } = createPostGenerationParser(context);
  const candidates = extractPostGenerationCandidates(
    content,
    cleanPost,
    isValid,
  );

  return candidates.slice(0, maxCount).map((candidate) => {
    if (typeof candidate !== 'string') {
      return null;
    }

    const post = cleanPost(candidate);
    return post.length > 0 && isValid(post) ? post : null;
  });
}

function createPostGenerationParser(
  context?: Pick<AccountPublishingContext, 'constraints'>,
) {
  const maxLength =
    context?.constraints.maxWeightedCharacters ??
    context?.constraints.maxCharacters ??
    560;
  const usesWeightedCharacters =
    context?.constraints.usesWeightedCharacters ?? false;
  const cleanPost = (post: string) =>
    post.replace(/^[-*\s]*(?:tweet|post)?\s*\d+[:.)-]\s*/i, '').trim();
  const isValid = (post: string) =>
    isValidPostLength(post, maxLength, usesWeightedCharacters);

  return { cleanPost, isValid };
}

function extractPostGenerationCandidates(
  content: string,
  cleanPost: (post: string) => string,
  isValid: (post: string) => boolean,
): unknown[] {
  try {
    const trimmedContent = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(trimmedContent);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    if (content.includes('---')) {
      const separatedCandidates = removeStructuralSeparators(
        content.split('---'),
        cleanPost,
      );
      if (
        separatedCandidates.some((post) => {
          const cleaned = cleanPost(post);
          return isValid(cleaned);
        })
      ) {
        return separatedCandidates;
      }
    }

    const lineCandidates = removeStructuralSeparators(
      content.split('\n'),
      cleanPost,
    );
    const hasValidLine = lineCandidates.some((post) => {
      const cleaned = cleanPost(post);
      return isValid(cleaned);
    });

    return hasValidLine
      ? lineCandidates
      : removeStructuralSeparators(content.split(/\n\n+/), cleanPost);
  }

  return [];
}

function removeStructuralSeparators(
  candidates: string[],
  cleanPost: (post: string) => string,
): string[] {
  return candidates.filter((post) => cleanPost(post).length > 0);
}

export function extractPostGenerationLabel(
  postText: string,
  maxLength = 50,
): string {
  if (!postText || postText.trim().length === 0) {
    return '';
  }

  const normalized = postText
    .replace(/<[^>]+>/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return `${truncated.substring(0, lastSpace)}...`;
  }

  return `${truncated}...`;
}
