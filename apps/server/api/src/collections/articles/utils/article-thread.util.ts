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

/**
 * Hard-split a string into postable segments no longer than `maxChars`.
 *
 * Greedily packs whitespace-delimited words; a single word longer than the
 * limit (e.g. a long URL or hash with no whitespace to break on) is chunked by
 * character count. Guarantees every returned segment is `<= maxChars`, so it can
 * never produce an unpostable tweet. Returns `[]` for blank input.
 */
function splitIntoTweetSegments(
  text: string,
  maxChars: number = MAX_TWEET_CHARS,
): string[] {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return [];
  }

  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const segments: string[] = [];
  let current = '';

  const flush = (): void => {
    if (current) {
      segments.push(current);
      current = '';
    }
  };

  for (const word of trimmed.split(/\s+/)) {
    if (word.length > maxChars) {
      // No whitespace to break on — chunk the oversized token by characters,
      // carrying any sub-limit remainder forward to pack with following words.
      flush();
      for (let index = 0; index < word.length; index += maxChars) {
        const chunk = word.slice(index, index + maxChars);
        if (chunk.length === maxChars) {
          segments.push(chunk);
        } else {
          current = chunk;
        }
      }
      continue;
    }

    if (`${current} ${word}`.trim().length <= maxChars) {
      current += (current ? ' ' : '') + word;
    } else {
      flush();
      current = word;
    }
  }

  flush();

  return segments;
}

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
    // Title alone when title + summary is too long — but the title itself can
    // exceed the limit, so hard-split it rather than emit an unpostable tweet.
    for (const segment of splitIntoTweetSegments(params.label)) {
      tweets.push({
        characterCount: segment.length,
        content: segment,
        order: tweets.length + 1,
      });
    }
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
      // Split long paragraph by sentences, then pack sentence fragments into
      // tweets. A single sentence (or token) longer than the limit is itself
      // hard-split via splitIntoTweetSegments so no over-limit tweet is emitted.
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let currentTweet = '';

      const flushCurrentTweet = (): void => {
        const finalized = currentTweet.trim();
        if (finalized) {
          tweets.push({
            characterCount: finalized.length,
            content: finalized,
            order: tweets.length + 1,
          });
        }
        currentTweet = '';
      };

      sentences.forEach((sentence) => {
        splitIntoTweetSegments(sentence).forEach((unit) => {
          if (`${currentTweet} ${unit}`.trim().length <= MAX_TWEET_CHARS) {
            currentTweet += (currentTweet ? ' ' : '') + unit;
          } else {
            flushCurrentTweet();
            currentTweet = unit;
          }
        });
      });

      flushCurrentTweet();
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
