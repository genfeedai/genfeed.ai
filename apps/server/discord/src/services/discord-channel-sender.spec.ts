import { sendDiscordChannelMessage } from '@discord/services/discord-channel-sender';
import { BaseGuildTextChannel, type Client } from 'discord.js';

type LogLine = { args: unknown[]; level: 'error' | 'log' | 'warn' };

/** Logger that keeps the operator-facing lines the sender writes. */
function createLogger() {
  const lines: LogLine[] = [];
  const record =
    (level: LogLine['level']) =>
    (...args: unknown[]) => {
      lines.push({ args, level });
    };
  return {
    lines,
    logger: {
      error: record('error'),
      log: record('log'),
      warn: record('warn'),
    },
  };
}

/** A guild text channel that records what was posted to it. */
function createTextChannel(sendError?: Error) {
  const channel = Object.create(BaseGuildTextChannel.prototype) as {
    guildId: string;
    send: (message: { content: string }) => Promise<{ id: string }>;
    sent: { content: string }[];
  };
  channel.guildId = 'guild-1';
  channel.sent = [];
  channel.send = async (message) => {
    if (sendError) throw sendError;
    channel.sent.push(message);
    return { id: `msg-${channel.sent.length}` };
  };
  return channel;
}

function createClient(fetchChannel: () => Promise<unknown>): Client {
  return { channels: { fetch: fetchChannel } } as unknown as Client;
}

const FAILED_LINE =
  '[DiscordBotManager] Failed to send message to channel ch-1 for orgId: org-1';

describe('sendDiscordChannelMessage', () => {
  it('should warn and return null when there is no active bot client', async () => {
    const { lines, logger } = createLogger();

    const result = await sendDiscordChannelMessage(
      undefined,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(lines).toEqual([
      {
        args: ['[DiscordBotManager] No active bot found for orgId: org-1'],
        level: 'warn',
      },
    ]);
  });

  it('should warn and return null when the channel is not found', async () => {
    const { lines, logger } = createLogger();
    const client = createClient(async () => null);

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(lines).toEqual([
      {
        args: [
          '[DiscordBotManager] Channel ch-1 not found or not a text channel for orgId: org-1',
        ],
        level: 'warn',
      },
    ]);
  });

  it('should warn and return null when the channel is not a guild text channel', async () => {
    const { lines, logger } = createLogger();
    const client = createClient(async () => ({ id: 'ch-1', type: 2 }));

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(lines).toEqual([expect.objectContaining({ level: 'warn' })]);
  });

  it('should send the message and return the message url', async () => {
    const { lines, logger } = createLogger();
    const channel = createTextChannel();
    const client = createClient(async () => channel);

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(channel.sent).toEqual([{ content: 'hello' }]);
    expect(result).toBe('https://discord.com/channels/guild-1/ch-1/msg-1');
    expect(lines).toEqual([
      {
        args: [
          '[DiscordBotManager] Message sent to channel ch-1 for orgId: org-1',
        ],
        level: 'log',
      },
    ]);
  });

  it('should log and return null when fetching the channel throws', async () => {
    const { lines, logger } = createLogger();
    const error = new Error('Missing Access');
    const client = createClient(async () => {
      throw error;
    });

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(lines).toEqual([{ args: [FAILED_LINE, error], level: 'error' }]);
  });

  it('should log and return null when sending fails', async () => {
    const { lines, logger } = createLogger();
    const error = new Error('Cannot send');
    const channel = createTextChannel(error);
    const client = createClient(async () => channel);

    const result = await sendDiscordChannelMessage(
      client,
      'org-1',
      'ch-1',
      'hello',
      logger,
    );

    expect(result).toBeNull();
    expect(channel.sent).toEqual([]);
    expect(lines).toEqual([{ args: [FAILED_LINE, error], level: 'error' }]);
  });
});
