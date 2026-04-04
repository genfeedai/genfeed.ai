import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { ChatBotService } from '@notifications/services/chatbot/chatbot.service';
import { GenFeedService } from '@notifications/services/genfeed/genfeed.service';
import type { Mocked } from 'vitest';

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

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates a response using GenFeedService', async () => {
    const res = await service.generateResponse('hello');
    expect(res).toBe('hi');
    expect(genFeedService.generateResponse).toHaveBeenCalledWith({
      prompt: 'hello',
      type: 'chat',
    });
  });
});
