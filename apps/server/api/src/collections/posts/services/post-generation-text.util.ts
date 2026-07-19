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
  let postLines: string[] = [];
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

  try {
    const trimmedContent = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(trimmedContent);
    if (Array.isArray(parsed)) {
      postLines = parsed
        .map((post: unknown) => cleanPost(String(post)))
        .filter((post: string) => post.length > 0 && isValid(post))
        .slice(0, maxCount);
    }
  } catch {
    const posts = content.includes('---')
      ? content
          .split('---')
          .map((post) => cleanPost(post))
          .filter((post) => post.length > 0 && isValid(post))
          .slice(0, maxCount)
      : [];

    if (posts.length > 0) {
      postLines = posts;
    } else {
      const numberedOrLinePosts = content
        .split('\n')
        .map((post) => cleanPost(post))
        .filter((post) => post.length > 0 && isValid(post))
        .slice(0, maxCount);

      if (numberedOrLinePosts.length > 0) {
        return numberedOrLinePosts;
      }

      postLines = content
        .split(/\n\n+/)
        .map((post) => cleanPost(post))
        .filter((post) => post.length > 0 && isValid(post))
        .slice(0, maxCount);
    }
  }

  return postLines;
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
