import { ReplyBotPlatform, ReplyBotType } from '@genfeedai/contracts';

export function normalizeReplyBotPlatform(
  value: unknown,
): ReplyBotPlatform | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return Object.values(ReplyBotPlatform).find(
    (platform) => platform === normalized,
  );
}

export function unsupportedReplyBotPlatformMessage(value: unknown): string {
  const platform =
    typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : 'unknown';

  return `Unsupported reply bot platform: ${platform}`;
}

/**
 * X rejects API replies to accounts that never @mentioned or quoted the poster
 * (self-serve plans, since 2026-02-23) and its automation rules ban unsolicited
 * auto-replies. A bot that answers the posts of accounts it monitors is exactly
 * that, so its replies are drafted for a person to post in X. Mention-triggered
 * and own-post bots answer someone who contacted the account and still post.
 * A missing platform means X, matching the credential default.
 */
export function isManualReplyRequired(
  botType: unknown,
  platform: unknown,
): boolean {
  return (
    normalizeReplyBotPlatform(platform ?? ReplyBotPlatform.TWITTER) ===
      ReplyBotPlatform.TWITTER && botType === ReplyBotType.ACCOUNT_MONITOR
  );
}
