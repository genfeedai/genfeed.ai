import { sendDiscordChannelMessage } from '@discord/services/discord-channel-sender';
import { BaseGuildTextChannel, type Client } from 'discord.js';

interface SenderLoggerMocks {
  error: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

function createLogger(): SenderLoggerMocks {
  return { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
}

function createTextChannel(sendMock: ReturnType<typeof vi.fn>): {
  guildId: string;
  send: ReturnType<typeof vi.fn>;
} {
  const channel = Object.create(BaseGuildTextChannel.prototype) as {
    guildId: string;
    send: ReturnType<typeof vi.fn>;
  };
  channel.guildId = 'guild-1';
  channel.send = sendMock;
  return channel;
}

function createClient(fetchMock: ReturnType<typeof vi.fn>): Client {
  return { channels: { fetch: fetchMock } } as unknown as Client;
}

describe('sendDiscordChannelMessage', () => {
  it('should warn and return null when there is no active bot client', async () => {
    const logger = createLogger();

    const result = await sendDiscordChannelMessage(
      undefined,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      '[DiscordBotManager] No active bot found for orgId: org-1',
    );
  });

  it('should warn and return null when the channel is not found', async () => {
    const logger = createLogger();
    const client = createClient(vi.fn().mockResolvedValue(null));

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      '[DiscordBotManager] Channel ch-1 not found or not a text channel for orgId: org-1',
    );
  });

  it('should warn and return null when the channel is not a guild text channel', async () => {
    const logger = createLogger();
    const client = createClient(
      vi.fn().mockResolvedValue({ id: 'ch-1', type: 2 }),
    );

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should send the message and return the message url', async () => {
    const logger = createLogger();
    const send = vi.fn().mockResolvedValue({ id: 'msg-1' });
    const channel = createTextChannel(send);
    const client = createClient(vi.fn().mockResolvedValue(channel));

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(send).toHaveBeenCalledWith({ content: 'hello' });
    expect(result).toBe('https://discord.com/channels/guild-1/ch-1/msg-1');
    expect(logger.log).toHaveBeenCalledWith(
      '[DiscordBotManager] Message sent to channel ch-1 for orgId: org-1',
    );
  });

  it('should log and return null when fetching the channel throws', async () => {
    const logger = createLogger();
    const error = new Error('Missing Access');
    const client = createClient(vi.fn().mockRejectedValue(error));

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      '[DiscordBotManager] Failed to send message to channel ch-1 for orgId: org-1',
      error,
    );
  });

  it('should log and return null when sending fails', async () => {
    const logger = createLogger();
    const error = new Error('Cannot send');
    const channel = createTextChannel(vi.fn().mockRejectedValue(error));
    const client = createClient(vi.fn().mockResolvedValue(channel));

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      '[DiscordBotManager] Failed to send message to channel ch-1 for orgId: org-1',
      error,
    );
  });
});
