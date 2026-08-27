import { ReplyBotPlatform } from '@genfeedai/enums';

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
