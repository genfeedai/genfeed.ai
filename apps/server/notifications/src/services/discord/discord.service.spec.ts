import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { WebhookClient } from 'discord.js';
import type { Mock } from 'vitest';

// Mock discord.js before importing DiscordService
const mockSend = vi.fn();
vi.mock('discord.js', () => ({
  WebhookClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
}));

// Mock ConfigService module to avoid import resolution issues
vi.mock('@notifications/config/config.service', () => ({
  ConfigService: vi.fn(),
}));

describe('DiscordService', () => {
  let service: DiscordService;

  beforeEach(async () => {
    mockSend.mockClear();
    (WebhookClient as unknown as Mock).mockClear();

    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        DiscordService,
        {
          provide: 'ConfigService',
          useValue: {
            get: vi.fn(() => 'https://discord.com/api/webhooks/123/abc'),
            isDiscordEnabled: vi.fn(() => true),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DiscordService>(DiscordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should send webhook message', async () => {
    await service.sendWebhookMessage({ content: 'hello' });
    expect(mockSend).toHaveBeenCalledWith({ content: 'hello' });
  });
});
