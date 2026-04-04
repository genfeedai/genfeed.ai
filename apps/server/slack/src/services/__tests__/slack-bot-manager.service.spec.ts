import { OrgIntegration, REDIS_EVENTS } from '@genfeedai/integrations';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@slack/config/config.service';
import { SlackBotManager } from '@slack/services/slack-bot-manager.service';
import { of, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

// Mock @slack/bolt
const { mockApp, MockAppConstructor } = vi.hoisted(() => {
  const app = {
    action: vi.fn(),
    command: vi.fn(),
    event: vi.fn(),
    message: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    use: vi.fn(),
  };
  const ctor = vi.fn(function () {
    return app;
  });
  return { MockAppConstructor: ctor, mockApp: app };
});

vi.mock('@slack/bolt', () => ({
  App: MockAppConstructor,
}));

describe('SlackBotManager', () => {
  let service: SlackBotManager;
  let _configService: Mocked<ConfigService>;
  let httpService: Mocked<HttpService>;
  let redisService: Mocked<RedisService>;
  let loggerRef: Logger;

  const mockIntegration: OrgIntegration = {
    botToken: 'xoxb-slack-token',
    config: {
      allowedUserIds: ['U123456', 'U789012'],
      appToken: 'xapp-app-token',
      defaultWorkflow: 'wf-slack-gen',
    },
    createdAt: new Date('2024-01-01'),
    id: 'slack-integration-1',
    orgId: 'org-456',
    platform: 'slack',
    status: 'active',
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const mockConfigService = {
      API_KEY: 'test-key',
      API_URL: 'http://localhost:3001',
      get: vi.fn(),
      SERVICE_NAME: 'slack',
    };

    const mockHttpService = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    };

    const mockRedisService = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackBotManager,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<SlackBotManager>(SlackBotManager);
    _configService = module.get(ConfigService);
    httpService = module.get(HttpService);
    redisService = module.get(RedisService);

    // Mock logger to avoid console noise
    loggerRef = service['logger'];
    vi.spyOn(loggerRef, 'log').mockImplementation();
    vi.spyOn(loggerRef, 'warn').mockImplementation();
    vi.spyOn(loggerRef, 'error').mockImplementation();
    vi.spyOn(loggerRef, 'debug').mockImplementation();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockApp.start.mockClear();
    mockApp.stop.mockClear();
    mockApp.command.mockClear();
    mockApp.event.mockClear();
    mockApp.message.mockClear();
    mockApp.action.mockClear();
    mockApp.use.mockClear();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      httpService.get.mockReturnValue(of({ data: [] } as any));

      await service.initialize();

      expect(redisService.subscribe).toHaveBeenCalledTimes(3);
      expect(redisService.subscribe).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        expect.any(Function),
      );
      expect(loggerRef.log).toHaveBeenCalledWith(
        'Initializing Slack Bot Manager',
      );
      expect(loggerRef.log).toHaveBeenCalledWith(
        'Slack Bot Manager initialized with 0 bots',
      );
    });
  });

  describe('shutdown', () => {
    it('should shutdown successfully', async () => {
      await service.shutdown();

      expect(loggerRef.log).toHaveBeenCalledWith(
        'Shutting down Slack Bot Manager',
      );
    });
  });

  describe('createBotInstance', () => {
    it('should create a Slack app instance with correct config', async () => {
      mockApp.start.mockResolvedValue(undefined);

      const instance = await service.createBotInstance(mockIntegration);

      expect(instance).toEqual({
        app: mockApp,
        id: mockIntegration.id,
        integration: mockIntegration,
        orgId: mockIntegration.orgId,
      });

      // Verify App was created with correct configuration
      expect(MockAppConstructor).toHaveBeenCalledWith({
        appToken: 'xapp-app-token',
        socketMode: true,
        token: 'xoxb-slack-token',
      });

      expect(mockApp.command).toHaveBeenCalledWith(
        '/workflows',
        expect.any(Function),
      );
      expect(mockApp.start).toHaveBeenCalled();
    });

    it('should handle configuration without appToken', async () => {
      const integrationWithoutAppToken = {
        ...mockIntegration,
        config: {
          ...mockIntegration.config,
          appToken: undefined,
        },
      };

      mockApp.start.mockResolvedValue(undefined);

      const instance = await service.createBotInstance(
        integrationWithoutAppToken,
      );

      expect(instance).toEqual({
        app: mockApp,
        id: integrationWithoutAppToken.id,
        integration: integrationWithoutAppToken,
        orgId: integrationWithoutAppToken.orgId,
      });

      expect(MockAppConstructor).toHaveBeenCalledWith({
        appToken: undefined,
        socketMode: true,
        token: 'xoxb-slack-token',
      });
    });

    it('should handle app start failure', async () => {
      const error = new Error('Failed to start Slack app');
      mockApp.start.mockRejectedValue(error);

      await expect(service.createBotInstance(mockIntegration)).rejects.toThrow(
        'Failed to start Slack app',
      );
    });

    it('should set up slash commands correctly', async () => {
      mockApp.start.mockResolvedValue(undefined);

      await service.createBotInstance(mockIntegration);

      expect(mockApp.command).toHaveBeenCalledWith(
        '/workflows',
        expect.any(Function),
      );
    });
  });

  describe('destroyBotInstance', () => {
    it('should stop the Slack app', async () => {
      const mockInstance = {
        app: mockApp,
        id: mockIntegration.id,
        integration: mockIntegration,
        orgId: mockIntegration.orgId,
      };

      mockApp.stop.mockResolvedValue(undefined);

      await service.destroyBotInstance(mockInstance);

      expect(mockApp.stop).toHaveBeenCalled();
    });

    it('should handle app stop failure gracefully', async () => {
      const mockInstance = {
        app: mockApp,
        id: mockIntegration.id,
        integration: mockIntegration,
        orgId: mockIntegration.orgId,
      };

      const error = new Error('Stop failed');
      mockApp.stop.mockRejectedValue(error);

      // Service catches errors in destroyBotInstance and logs an error
      await service.destroyBotInstance(mockInstance);

      expect(loggerRef.error).toHaveBeenCalledWith(
        `Error stopping bot ${mockIntegration.id}`,
        error,
      );
    });
  });

  describe('addIntegration', () => {
    it('should add a new Slack integration successfully', async () => {
      mockApp.start.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);

      expect(service.getActiveCount()).toBe(1);
      expect(loggerRef.log).toHaveBeenCalledWith(
        'Adding integration slack-integration-1 for org org-456',
      );
    });

    it('should update existing integration when adding duplicate', async () => {
      mockApp.start.mockResolvedValue(undefined);
      mockApp.stop.mockResolvedValue(undefined);

      // Add first time
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Add again (should update)
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      expect(loggerRef.warn).toHaveBeenCalledWith(
        'Integration slack-integration-1 already exists, updating instead',
      );
    });

    it('should handle creation errors', async () => {
      const error = new Error('Slack app creation failed');
      mockApp.start.mockRejectedValue(error);

      await expect(service.addIntegration(mockIntegration)).rejects.toThrow(
        'Slack app creation failed',
      );

      expect(service.getActiveCount()).toBe(0);
      expect(loggerRef.error).toHaveBeenCalledWith(
        'Failed to add integration slack-integration-1:',
        error,
      );
    });
  });

  describe('updateIntegration', () => {
    it('should update an existing integration', async () => {
      mockApp.start.mockResolvedValue(undefined);
      mockApp.stop.mockResolvedValue(undefined);

      // Add integration first
      await service.addIntegration(mockIntegration);

      // Update it
      const updatedIntegration = {
        ...mockIntegration,
        config: {
          ...mockIntegration.config,
          defaultWorkflow: 'new-slack-workflow',
        },
      };

      await service.updateIntegration(updatedIntegration);

      expect(service.getActiveCount()).toBe(1);
      expect(loggerRef.log).toHaveBeenCalledWith(
        'Successfully updated integration slack-integration-1',
      );
    });
  });

  describe('removeIntegration', () => {
    it('should remove an existing integration', async () => {
      mockApp.start.mockResolvedValue(undefined);
      mockApp.stop.mockResolvedValue(undefined);

      // Add integration first
      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      // Remove it
      await service.removeIntegration(mockIntegration.id);

      expect(mockApp.stop).toHaveBeenCalled();
      expect(service.getActiveCount()).toBe(0);
      expect(loggerRef.log).toHaveBeenCalledWith(
        'Successfully removed integration slack-integration-1',
      );
    });

    it('should handle removal of non-existent integration', async () => {
      await service.removeIntegration('non-existent-slack-id');

      expect(loggerRef.warn).toHaveBeenCalledWith(
        'Integration non-existent-slack-id not found',
      );
      expect(mockApp.stop).not.toHaveBeenCalled();
    });

    it('should handle removal errors gracefully', async () => {
      mockApp.start.mockResolvedValue(undefined);
      mockApp.stop.mockRejectedValue(new Error('Stop error'));

      // Add integration first
      await service.addIntegration(mockIntegration);

      // destroyBotInstance catches stop errors internally and logs an error,
      // so removeIntegration should complete without throwing
      await service.removeIntegration(mockIntegration.id);

      expect(loggerRef.error).toHaveBeenCalledWith(
        `Error stopping bot ${mockIntegration.id}`,
        expect.any(Error),
      );
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 for empty manager', () => {
      expect(service.getActiveCount()).toBe(0);
    });

    it('should return correct count after adding integrations', async () => {
      mockApp.start.mockResolvedValue(undefined);

      await service.addIntegration(mockIntegration);
      expect(service.getActiveCount()).toBe(1);

      const secondIntegration = {
        ...mockIntegration,
        id: 'slack-integration-2',
        orgId: 'org-789',
      };
      await service.addIntegration(secondIntegration);
      expect(service.getActiveCount()).toBe(2);
    });
  });

  describe('fetchAndAddIntegration', () => {
    it('should fetch integration and add it', async () => {
      mockApp.start.mockResolvedValue(undefined);
      httpService.get.mockReturnValue(of({ data: mockIntegration } as any));

      await service['fetchAndAddIntegration']('slack-integration-1');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          '/internal/integrations/slack/slack-integration-1',
        ),
        expect.any(Object),
      );
      expect(service.getActiveCount()).toBe(1);
    });

    it('should handle fetch errors gracefully', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Fetch failed')),
      );

      await service['fetchAndAddIntegration']('slack-integration-1');

      expect(loggerRef.error).toHaveBeenCalledWith(
        'Failed to fetch and add integration slack-integration-1:',
        expect.any(Error),
      );
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('fetchAndUpdateIntegration', () => {
    it('should fetch integration and update it', async () => {
      mockApp.start.mockResolvedValue(undefined);
      mockApp.stop.mockResolvedValue(undefined);

      // Add initial integration
      await service.addIntegration(mockIntegration);

      const updatedIntegration = {
        ...mockIntegration,
        status: 'paused' as const,
      };
      httpService.get.mockReturnValue(of({ data: updatedIntegration } as any));

      await service['fetchAndUpdateIntegration']('slack-integration-1');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          '/internal/integrations/slack/slack-integration-1',
        ),
        expect.any(Object),
      );
    });

    it('should handle fetch errors gracefully', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Fetch failed')),
      );

      await service['fetchAndUpdateIntegration']('slack-integration-1');

      expect(loggerRef.error).toHaveBeenCalledWith(
        'Failed to fetch and update integration slack-integration-1:',
        expect.any(Error),
      );
    });
  });

  describe('Redis hot reload', () => {
    it('should hot-add integration for Slack events only', async () => {
      const handlers = new Map<string, (message: unknown) => void>();

      redisService.subscribe.mockImplementation(
        (channel: string, handler?: (message: unknown) => void) => {
          if (handler) {
            handlers.set(channel, handler);
          }
        },
      );

      mockApp.start.mockResolvedValue(undefined);
      httpService.get.mockImplementation((url: string) => {
        if (url.endsWith('/v1/internal/integrations/slack')) {
          return of({ data: [] } as any);
        }

        if (
          url.endsWith('/v1/internal/integrations/slack/slack-integration-1')
        ) {
          return of({ data: mockIntegration } as any);
        }

        return of({ data: [] } as any);
      });

      await service.initialize();

      handlers.get(REDIS_EVENTS.INTEGRATION_CREATED)?.({
        integrationId: 'slack-integration-1',
        orgId: 'org-456',
        platform: 'slack',
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(service.getActiveCount()).toBe(1);
      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v1/internal/integrations/slack/slack-integration-1',
        ),
        expect.any(Object),
      );
    });
  });
});
