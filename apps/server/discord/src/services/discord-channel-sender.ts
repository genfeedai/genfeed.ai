import { BaseGuildTextChannel, type Client } from 'discord.js';

interface ChannelSenderLogger {
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

/**
 * Send a message through an already-running Discord bot client.
 */
export async function sendDiscordChannelMessage(
  client: Client | undefined,
  orgId: string,
  channelId: string,
  message: string,
  logger: ChannelSenderLogger,
): Promise<string | null> {
  if (!client) {
    logger.warn(`[DiscordBotManager] No active bot found for orgId: ${orgId}`);
    return null;
  }

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !(channel instanceof BaseGuildTextChannel)) {
      logger.warn(
        `[DiscordBotManager] Channel ${channelId} not found or not a text channel for orgId: ${orgId}`,
      );
      return null;
    }

    const sent = await channel.send({ content: message });
    const messageUrl = `https://discord.com/channels/${channel.guildId}/${channelId}/${sent.id}`;

    logger.log(
      `[DiscordBotManager] Message sent to channel ${channelId} for orgId: ${orgId}`,
    );

    return messageUrl;
  } catch (error) {
    logger.error(
      `[DiscordBotManager] Failed to send message to channel ${channelId} for orgId: ${orgId}`,
      error,
    );
    return null;
  }
}
