const X_SNOWFLAKE_PATTERN = /^\d{1,20}$/;

/**
 * X's web intent opens the reply composer, prefilled, in the person's own
 * session. Nothing is sent until they press Post in X.
 */
export function buildXReplyIntentUrl(
  targetTweetId: string,
  text: string,
): string | null {
  if (!X_SNOWFLAKE_PATTERN.test(targetTweetId)) {
    return null;
  }
  return `https://x.com/intent/post?in_reply_to=${targetTweetId}&text=${encodeURIComponent(text)}`;
}
