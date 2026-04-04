import {
  type BotDocument,
  type BotTarget,
} from '@api/collections/bots/schemas/bot.schema';
import { BotsLivestreamDeliveryService } from '@api/collections/bots/services/bots-livestream-delivery.service';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { ConfigService } from '@api/config/config.service';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  liveBroadcastsListMock,
  oauth2ConstructorMock,
  setCredentialsMock,
  youtubeFactoryMock,
} = vi.hoisted(() => {
  const setCredentialsMock = vi.fn();
  const liveBroadcastsListMock = vi.fn();
  const youtubeFactoryMock = vi.fn(() => ({
    liveBroadcasts: {
      list: liveBroadcastsListMock,
    },
  }));
  const oauth2ConstructorMock = vi.fn(function OAuth2Mock() {
    return {
      setCredentials: setCredentialsMock,
    };
  });

  return {
    liveBroadcastsListMock,
    oauth2ConstructorMock,
    setCredentialsMock,
    youtubeFactoryMock,
  };
});

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
  post: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: oauth2ConstructorMock,
    },
    youtube: youtubeFactoryMock,
  },
}));

function createCredentialQueryMock(result: CredentialDocument | null) {
  return {
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('BotsLivestreamDeliveryService', () => {
  const axiosPostMock = vi.mocked(axios.post);
  const configService = {
    get: vi.fn(),
  } as unknown as ConfigService & {
    get: ReturnType<typeof vi.fn>;
  };

  const bot = {
    organization: 'org-123',
  } as BotDocument;

  const credential = {
    accessToken: 'access-token',
    externalId: 'credential-external-id',
    refreshToken: 'refresh-token',
  } as CredentialDocument;

  let credentialModel: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let service: BotsLivestreamDeliveryService;

  beforeEach(() => {
    vi.clearAllMocks();

    credentialModel = {
      findOne: vi.fn().mockReturnValue(createCredentialQueryMock(credential)),
    };

    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        TWITCH_CLIENT_ID: 'twitch-client-id',
        YOUTUBE_CLIENT_ID: 'youtube-client-id',
        YOUTUBE_CLIENT_SECRET: 'youtube-client-secret',
        YOUTUBE_REDIRECT_URI: 'https://genfeed.ai/oauth/youtube/callback',
      };

      return values[key];
    });

    liveBroadcastsListMock.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              liveChatId: 'resolved-live-chat-id',
            },
          },
        ],
      },
    });

    service = new BotsLivestreamDeliveryService(
      configService,
      credentialModel as never,
    );
  });

  it('posts to a configured YouTube live chat target', async () => {
    const target = {
      channelId: 'youtube-channel-id',
      credentialId: 'credential-id',
      liveChatId: 'configured-live-chat-id',
      platform: 'youtube',
    } as BotTarget;

    const result = await service.deliverMessage(bot, target, 'Ship it live');

    expect(credentialModel.findOne).toHaveBeenCalledWith({
      _id: 'credential-id',
      isConnected: true,
      isDeleted: false,
      organization: 'org-123',
    });
    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
      {
        snippet: {
          liveChatId: 'configured-live-chat-id',
          textMessageDetails: {
            messageText: 'Ship it live',
          },
          type: 'textMessageEvent',
        },
      },
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    );
    expect(youtubeFactoryMock).not.toHaveBeenCalled();
    expect(result).toEqual({ resolvedTargetId: 'configured-live-chat-id' });
  });

  it('resolves the active YouTube live chat when the target does not provide one', async () => {
    const target = {
      channelId: 'youtube-channel-id',
      credentialId: 'credential-id',
      platform: 'youtube',
    } as BotTarget;

    const result = await service.deliverMessage(
      bot,
      target,
      'Ask the audience',
    );

    expect(oauth2ConstructorMock).toHaveBeenCalledWith(
      'youtube-client-id',
      'youtube-client-secret',
      'https://genfeed.ai/oauth/youtube/callback',
    );
    expect(setCredentialsMock).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(youtubeFactoryMock).toHaveBeenCalledWith({
      auth: expect.any(Object),
      version: 'v3',
    });
    expect(liveBroadcastsListMock).toHaveBeenCalledWith({
      broadcastStatus: 'active',
      mine: true,
      part: ['snippet', 'status'],
    });
    expect(axiosPostMock).toHaveBeenLastCalledWith(
      'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
      expect.objectContaining({
        snippet: expect.objectContaining({
          liveChatId: 'resolved-live-chat-id',
        }),
      }),
      expect.any(Object),
    );
    expect(result).toEqual({ resolvedTargetId: 'resolved-live-chat-id' });
  });

  it('throws when no active YouTube live chat can be resolved', async () => {
    liveBroadcastsListMock.mockResolvedValue({
      data: {
        items: [],
      },
    });

    const target = {
      channelId: 'youtube-channel-id',
      credentialId: 'credential-id',
      platform: 'youtube',
    } as BotTarget;

    await expect(
      service.deliverMessage(bot, target, 'No chat target'),
    ).rejects.toThrow('No active YouTube live chat could be resolved');

    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('posts to Twitch chat with the expected Helix query params and headers', async () => {
    const target = {
      channelId: 'broadcaster-id',
      credentialId: 'credential-id',
      platform: 'twitch',
      senderId: 'sender-id',
    } as BotTarget;

    const result = await service.deliverMessage(bot, target, 'Drop the link');

    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://api.twitch.tv/helix/chat/messages?broadcaster_id=broadcaster-id&sender_id=sender-id',
      {
        message: 'Drop the link',
      },
      {
        headers: {
          Authorization: 'Bearer access-token',
          'Client-Id': 'twitch-client-id',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(result).toEqual({ resolvedTargetId: 'broadcaster-id' });
  });

  it('falls back to the credential external ID for Twitch sender and broadcaster IDs', async () => {
    const target = {
      channelId: '',
      credentialId: 'credential-id',
      platform: 'twitch',
    } as BotTarget;

    const result = await service.deliverMessage(bot, target, 'Fallback IDs');

    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://api.twitch.tv/helix/chat/messages?broadcaster_id=credential-external-id&sender_id=credential-external-id',
      {
        message: 'Fallback IDs',
      },
      expect.any(Object),
    );
    expect(result).toEqual({ resolvedTargetId: 'credential-external-id' });
  });

  it('throws when the target credential is missing', async () => {
    credentialModel.findOne.mockReturnValue(createCredentialQueryMock(null));

    const target = {
      channelId: 'youtube-channel-id',
      credentialId: 'missing-credential-id',
      platform: 'youtube',
    } as BotTarget;

    await expect(
      service.deliverMessage(bot, target, 'Missing credential'),
    ).rejects.toThrow(
      'Credential missing-credential-id not found for livestream target',
    );
  });

  it('throws when Twitch client ID is not configured', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'TWITCH_CLIENT_ID') {
        return undefined;
      }

      return 'configured';
    });

    const target = {
      channelId: 'broadcaster-id',
      credentialId: 'credential-id',
      platform: 'twitch',
    } as BotTarget;

    await expect(
      service.deliverMessage(bot, target, 'No client ID'),
    ).rejects.toThrow('TWITCH_CLIENT_ID is not configured');
  });
});
