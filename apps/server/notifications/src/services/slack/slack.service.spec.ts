import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { SlackService } from '@notifications/services/slack/slack.service';

const mockPostMessage = vi.fn();

vi.mock('@slack/web-api', () => ({
  WebClient: class MockWebClient {
    chat = {
      postMessage: mockPostMessage,
    };
  },
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('testCaller'),
  },
}));

describe('SlackService', () => {
  const mockConfigService = {
    get: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfigService.get.mockReset();
    mockConfigService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    module.get<SlackService>(SlackService);
  });

  describe('sendMessage', () => {
    it('should warn and return early when client is not initialized', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const uninitializedService = module.get<SlackService>(SlackService);
      vi.clearAllMocks();

      await uninitializedService.sendMessage('C123', 'hello');

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('not initialized'),
        expect.any(Object),
      );
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('should include blocks when provided', async () => {
      mockConfigService.get.mockReturnValue('test-slack-bot-token');
      mockPostMessage.mockResolvedValue({ ok: true });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const s = module.get<SlackService>(SlackService);
      const blocks = [
        { text: { text: '*bold*', type: 'mrkdwn' }, type: 'section' },
      ];
      await s.sendMessage('C456', 'fallback', blocks);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ blocks }),
      );
    });

    it('should log error when postMessage fails', async () => {
      mockConfigService.get.mockReturnValue('test-slack-bot-token');
      mockPostMessage.mockRejectedValue(new Error('Rate limited'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const s = module.get<SlackService>(SlackService);
      await expect(s.sendMessage('C789', 'message')).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send'),
        expect.any(Error),
        expect.any(Object),
      );
    });
  });
});
