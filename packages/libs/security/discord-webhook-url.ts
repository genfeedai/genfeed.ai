const DISCORD_WEBHOOK_PATH_PATTERN = /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;

/** Only Discord's canonical HTTPS webhook endpoint; the token is a secret. */
export function discordWebhookUrl(value: string): URL | null {
  if (value.length > 512) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'discord.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !DISCORD_WEBHOOK_PATH_PATTERN.test(url.pathname)
    )
      return null;
    url.searchParams.set('wait', 'true');
    return url;
  } catch {
    return null;
  }
}
