import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { ChatBotService } from '@notifications/services/chatbot/chatbot.service';
import { GenFeedService } from '@notifications/services/genfeed/genfeed.service';
import axios from 'axios';
import type { Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

describe('ChatBotService', () => {
  let service: ChatBotService;
  let genFeedService: Mocked<GenFeedService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatBotService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const map: Record<string, string> = {
                TWITCH_CLIENT_ID: 'client',
              };
              return map[key];
            }),
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: GenFeedService,
          useValue: {
            generateResponse: vi.fn().mockResolvedValue('hi'),
          },
        },
      ],
    }).compile();

    service = module.get(ChatBotService);
    genFeedService = module.get(GenFeedService);
  });

  it('generates a response using GenFeedService', async () => {
    const res = await service.generateResponse('hello');
    expect(res).toBe('hi');
    expect(genFeedService.generateResponse).toHaveBeenCalledWith({
      prompt: 'hello',
      type: 'chat',
    });
  });

  it('rethrows generation failures', async () => {
    genFeedService.generateResponse.mockRejectedValue(new Error('api down'));

    await expect(service.generateResponse('hello')).rejects.toThrow('api down');
  });

  describe('sendToTwitchChat', () => {
    it('uses an explicit sender id when provided', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await service.sendToTwitchChat(
        'token-1',
        'caster-1',
        'hi chat',
        'sender-2',
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('sender_id=sender-2'),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('rethrows twitch API failures', async () => {
      mockedAxios.post.mockRejectedValue(new Error('twitch down'));

      await expect(
        service.sendToTwitchChat('token-1', 'caster-1', 'hi chat'),
      ).rejects.toThrow('twitch down');
    });
  });

  describe('sendToYouTubeChat', () => {
    it('rethrows youtube API failures', async () => {
      mockedAxios.post.mockRejectedValue(new Error('yt down'));

      await expect(
        service.sendToYouTubeChat('token-1', 'live-1', 'hi chat'),
      ).rejects.toThrow('yt down');
    });
  });

  describe('handleChat', () => {
    it('routes twitch chats through sendToTwitchChat', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await service.handleChat('twitch', 'token-1', 'caster-1', 'prompt');

      expect(genFeedService.generateResponse).toHaveBeenCalledWith({
        prompt: 'prompt',
        type: 'chat',
      });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('twitch.tv'),
        { message: 'hi' },
        expect.any(Object),
      );
    });

    it('routes youtube chats through sendToYouTubeChat', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });

      await service.handleChat('youtube', 'token-1', 'live-1', 'prompt');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('googleapis.com'),
        expect.objectContaining({
          snippet: expect.objectContaining({ liveChatId: 'live-1' }),
        }),
        expect.any(Object),
      );
    });
  });
});
