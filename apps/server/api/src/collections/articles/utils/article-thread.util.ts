import { TwitterThreadResponse } from '@api/collections/articles/dto/article-to-thread.dto';

/**
 * Pure Twitter/X thread builder for articles.
 *
 * Extracted verbatim from `ArticlesContentService.convertToTwitterThread` so the
 * text-splitting logic can be unit-tested in isolation. Behaviour is preserved
 * exactly, including the historical newline normalization (`\n+` collapses to a
 * single `\n` before paragraph splitting on `\n\n+`).
 */
export const MAX_TWEET_CHARS = 280;

export function buildTwitterThreadTweets(params: {
  /** Raw article content (may contain HTML — tags are stripped). */
  content: string;
  /** Resolved article label (already defaulted by the caller). */
  label: string;
  /** Article summary (empty string when absent). */
  summary: string;
  /** Fully-resolved public/preview article URL; omit to skip the link tweet. */
  articleUrl?: string;
}): TwitterThreadResponse['tweets'] {
  const content = params.content
    .replace(/<[^>]+>/g, '') // Strip HTML tags
    .replace(/\n+/g, '\n') // Normalize newlines
    .trim();

  // Split by double newlines (paragraphs) or by sentences if no paragraphs
  const paragraphs = content
    .split(/\n\n+/)
    .filter((paragraph) => paragraph.trim().length > 0);

  const tweets: TwitterThreadResponse['tweets'] = [];

  // First tweet: Title + summary
  const firstTweet = params.summary
    ? `${params.label}\n\n${params.summary}`
    : params.label;
  if (firstTweet.length <= MAX_TWEET_CHARS) {
    tweets.push({
      characterCount: firstTweet.length,
      content: firstTweet,
      order: 1,
    });
  } else {
    // Title only if too long
    tweets.push({
      characterCount: params.label.length,
      content: params.label,
      order: 1,
    });
  }

  // Convert each paragraph to a tweet
  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();

    if (trimmed.length === 0) {
      return;
    }

    if (trimmed.length <= MAX_TWEET_CHARS) {
      // Paragraph fits in one tweet
      tweets.push({
        characterCount: trimmed.length,
        content: trimmed,
        order: tweets.length + 1,
      });
    } else {
      // Split long paragraph by sentences
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let currentTweet = '';

      sentences.forEach((sentence) => {
        if (`${currentTweet} ${sentence}`.trim().length <= MAX_TWEET_CHARS) {
          currentTweet += (currentTweet ? ' ' : '') + sentence;
        } else {
          if (currentTweet) {
            tweets.push({
              characterCount: currentTweet.trim().length,
              content: currentTweet.trim(),
              order: tweets.length + 1,
            });
          }
          currentTweet = sentence;
        }
      });

      if (currentTweet.trim()) {
        tweets.push({
          characterCount: currentTweet.trim().length,
          content: currentTweet.trim(),
          order: tweets.length + 1,
        });
      }
    }
  });

  // Add final tweet with link (if a URL was resolved)
  if (params.articleUrl) {
    const finalTweet = `Read the full article:\n${params.articleUrl}`;

    if (finalTweet.length <= MAX_TWEET_CHARS) {
      tweets.push({
        characterCount: finalTweet.length,
        content: finalTweet,
        order: tweets.length + 1,
      });
    }
  }

  return tweets;
}
