import { describe, expect, it, vi } from 'vitest';
import { BotsRestreamChatService } from './bots-restream-chat.service';

describe('BotsRestreamChatService', () => {
  const livestream = {
    ingestTranscriptChunk: vi.fn().mockResolvedValue({ id: 'session-1' }),
  };
  const logger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
  const service = new BotsRestreamChatService(
    livestream as never,
    logger as never,
    undefined,
    undefined,
  );

  it('builds the official Restream chat websocket URL', () => {
    expect(service.buildChatWebSocketUrl('tok en')).toContain(
      'wss://chat.api.restream.io/ws?accessToken=',
    );
  });

  it('extracts text and author from loose Restream actions', () => {
    expect(
      service.extractChatText({
        action: 'event',
        payload: { text: 'hello stream' },
      }),
    ).toBe('hello stream');

    expect(
      service.extractAuthorLabel({
        author: { displayName: 'ViewerOne' },
      }),
    ).toBe('ViewerOne');
  });

  it('ingests chat actions as transcript context chunks', async () => {
    const result = await service.ingestChatActions(
      {
        id: 'bot-1',
        livestreamSettings: { transcriptEnabled: true },
      } as never,
      [
        {
          action: 'event',
          author: { displayName: 'Ada' },
          payload: { text: 'when is the drop?' },
        },
        { action: 'connection', payload: {} },
      ],
    );

    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(1);
    expect(livestream.ingestTranscriptChunk).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        text: 'Ada: when is the drop?',
      }),
    );
  });
});
